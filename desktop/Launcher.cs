using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Diagnostics;
using System.Drawing;
using System.Threading;
using System.Windows.Forms;

internal static class Launcher
{
    const string Address = "http://127.0.0.1:4173/";
    const string Identity = "qiaoqiao-local-1";
    static HttpListener listener;
    static string root;
    static readonly object lifetimeGate = new object();
    static readonly Stopwatch idle = Stopwatch.StartNew();
    static int openPages;
    static int idleSeconds = 120;
    static bool trackingStarted;
    static bool automaticExit = true;

    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        bool first;
        using (var mutex = new Mutex(true, @"Local\QiaoqiaoIsland4173", out first))
        {
            if (!first)
            {
                for (int i = 0; i < 20; i++)
                {
                    if (IsOurServer()) { OpenGame(); return; }
                    Thread.Sleep(100);
                }
                MessageBox.Show("游戏正在启动，请稍等片刻再打开。", "敲敲岛");
                return;
            }
            try
            {
                root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "dist")) + Path.DirectorySeparatorChar;
                if (!File.Exists(Path.Combine(root, "game", "index.html")))
                    throw new IOException("找不到游戏资源。请先解压整个文件夹，并把敲敲岛.exe 与 dist 文件夹放在一起。");
                // Keep the accepted browser origin so existing local saves remain available.
                if (PortInUse())
                    throw new IOException("本机端口 4173 已被占用。请先关闭旧的敲敲岛启动程序或测试服务，再双击打开。不会修改或清空存档。");
                listener = new HttpListener();
                listener.Prefixes.Add(Address);
                listener.Start();
                listener.BeginGetContext(Receive, null);
                using (var tray = new NotifyIcon())
                using (var menu = new ContextMenuStrip())
                using (var exitTimer = new System.Windows.Forms.Timer())
                {
                    menu.Items.Add("打开敲敲岛", null, (s, e) => OpenGame());
                    menu.Items.Add("退出敲敲岛", null, (s, e) => Application.Exit());
                    tray.Icon = SystemIcons.Application;
                    tray.Text = "敲敲岛 · 本地单机";
                    tray.ContextMenuStrip = menu;
                    tray.DoubleClick += (s, e) => OpenGame();
                    tray.Visible = true;
                    exitTimer.Interval = 1000;
                    exitTimer.Tick += (s, e) => {
                        lock (lifetimeGate)
                            if (automaticExit && trackingStarted && openPages == 0 && idle.Elapsed.TotalSeconds >= idleSeconds) Application.Exit();
                    };
                    exitTimer.Start();
                    OpenGame();
                    Application.Run();
                    tray.Visible = false;
                }
            }
            catch (Exception e)
            {
                MessageBox.Show("游戏未能启动：\n" + e.Message, "敲敲岛", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            finally
            {
                if (listener != null) listener.Close();
                mutex.ReleaseMutex();
            }
        }
    }

    static bool PortInUse()
    {
        try { using (var client = new TcpClient()) { client.Connect(IPAddress.Loopback, 4173); return true; } }
        catch (SocketException) { return false; }
    }

    static bool IsOurServer()
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create(Address + "__qiaoqiao_local__/status");
            request.Proxy = null; request.Timeout = 500; request.ReadWriteTimeout = 500;
            using (var response = request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
                return reader.ReadToEnd() == Identity;
        }
        catch (WebException) { return false; }
    }

    static void OpenGame()
    {
        lock (lifetimeGate) { idle.Restart(); idleSeconds = 120; }
        try { Process.Start(new ProcessStartInfo(Address) { UseShellExecute = true }); }
        catch (Exception)
        {
            MessageBox.Show("请在常用浏览器中打开：\n" + Address + "\n不需要连接互联网。", "敲敲岛");
        }
    }

    static void Receive(IAsyncResult pending)
    {
        HttpListenerContext context;
        try
        {
            context = listener.EndGetContext(pending);
            listener.BeginGetContext(Receive, null);
        }
        catch (HttpListenerException) { return; }
        catch (ObjectDisposedException) { return; }
        if (context.Request.Url.AbsolutePath == "/__qiaoqiao_local__/live")
        {
            KeepPageOpen(context); return;
        }
        try { Serve(context); }
        catch (Exception)
        {
            try { context.Response.StatusCode = 500; } catch { }
        }
        finally { try { context.Response.Close(); } catch { } }
    }

    // The response stays open in background tabs; no idle-input timer can end a paused game.
    static void KeepPageOpen(HttpListenerContext context)
    {
        bool counted = false;
        try
        {
            if (!IPAddress.IsLoopback(context.Request.RemoteEndPoint.Address) ||
                context.Request.HttpMethod != "GET" ||
                context.Request.Headers["X-Qiaoqiao-Page"] != "1")
            { context.Response.StatusCode = 403; return; }
            lock (lifetimeGate)
            {
                // Leave browser HTTP connections available for game assets, even with many tabs.
                if (openPages >= 4) { automaticExit = false; context.Response.StatusCode = 204; return; }
                openPages++; counted = true; trackingStarted = true; idleSeconds = 15;
            }
            var response = context.Response;
            response.ContentType = "application/octet-stream";
            response.Headers["Cache-Control"] = "no-store";
            response.SendChunked = true;
            var pulse = new byte[] { 10 };
            while (listener.IsListening)
            {
                response.OutputStream.Write(pulse, 0, pulse.Length);
                response.OutputStream.Flush();
                Thread.Sleep(2000);
            }
        }
        // A closed page or unsupported streaming must never crash the game server.
        catch (HttpListenerException) { }
        catch (IOException) { }
        catch (ObjectDisposedException) { }
        catch (Exception) { lock (lifetimeGate) automaticExit = false; }
        finally
        {
            if (counted) lock (lifetimeGate) { openPages--; if (openPages == 0) idle.Restart(); }
            try { context.Response.Close(); } catch { }
        }
    }

    static void Serve(HttpListenerContext context)
    {
        var response = context.Response;
        if (!IPAddress.IsLoopback(context.Request.RemoteEndPoint.Address)) { response.StatusCode = 403; return; }
        response.Headers["Cache-Control"] = "no-store";
        response.Headers["X-Content-Type-Options"] = "nosniff";
        response.Headers["X-Qiaoqiao-Lifecycle"] = "stream-v1";
        string method = context.Request.HttpMethod;
        if (method != "GET" && method != "HEAD")
        {
            response.StatusCode = 405; response.Headers["Allow"] = "GET, HEAD"; return;
        }
        string relative = Uri.UnescapeDataString(context.Request.Url.AbsolutePath).TrimStart('/');
        if (relative == "__qiaoqiao_local__/status")
        {
            Send(context, System.Text.Encoding.UTF8.GetBytes(Identity), "text/plain; charset=utf-8"); return;
        }
        if (relative.IndexOfAny(new char[] { '\\', ':', '\0' }) >= 0) { response.StatusCode = 403; return; }
        foreach (string segment in relative.Split('/'))
            if (segment.StartsWith(".")) { response.StatusCode = 403; return; }
        string file = Path.GetFullPath(Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar)));
        if (Directory.Exists(file))
        {
            if (!context.Request.Url.AbsolutePath.EndsWith("/"))
            {
                response.StatusCode = 302;
                response.RedirectLocation = context.Request.Url.AbsolutePath + "/" + context.Request.Url.Query;
                return;
            }
            file = Path.Combine(file, "index.html");
        }
        if (!file.StartsWith(root, StringComparison.OrdinalIgnoreCase)) { response.StatusCode = 403; return; }
        if (!File.Exists(file)) { response.StatusCode = 404; return; }
        string mime;
        switch (Path.GetExtension(file).ToLowerInvariant())
        {
            case ".html": mime = "text/html; charset=utf-8"; break;
            case ".js": case ".mjs": mime = "text/javascript; charset=utf-8"; break;
            case ".css": mime = "text/css; charset=utf-8"; break;
            case ".json": mime = "application/json; charset=utf-8"; break;
            case ".svg": mime = "image/svg+xml"; break;
            case ".png": mime = "image/png"; break;
            case ".jpg": case ".jpeg": mime = "image/jpeg"; break;
            case ".ico": mime = "image/x-icon"; break;
            default: mime = "application/octet-stream"; break;
        }
        Send(context, File.ReadAllBytes(file), mime);
    }

    static void Send(HttpListenerContext context, byte[] bytes, string mime)
    {
        context.Response.ContentType = mime;
        context.Response.ContentLength64 = bytes.Length;
        if (context.Request.HttpMethod != "HEAD") context.Response.OutputStream.Write(bytes, 0, bytes.Length);
    }
}
