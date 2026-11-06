// Ordinary web servers and older launchers keep their existing lifetime.
(() => {
  if (location.protocol === 'file:') {
    document.body.style.cssText = 'display:block;height:auto;min-height:100vh;overflow:auto;margin:0;padding:24px;box-sizing:border-box';
    const message = document.createElement('div');
    message.style.cssText = 'max-width:640px;margin:12vh auto;padding:28px;font:20px/1.8 system-ui,sans-serif;color:#40583b;background:#fff9e8;border-radius:16px';
    const title = document.createElement('h1');
    title.textContent = '请从「敲敲岛.exe」启动';
    title.style.cssText = 'font-size:28px;line-height:1.4';
    const instruction = document.createElement('p');
    instruction.textContent = '先完整解压下载的 ZIP，再回到解压后的文件夹，双击「敲敲岛.exe」。不要直接打开 dist 里的 HTML 文件。';
    const note = document.createElement('p');
    note.textContent = '游戏不需要联网。请把 EXE 和 dist 文件夹放在一起。';
    const link = document.createElement('a');
    link.href = 'http://127.0.0.1:4173/';
    link.textContent = '已经运行 EXE，进入游戏 →';
    message.append(title, instruction, note, link);
    document.body.replaceChildren(message);
    return;
  }
  if (location.hostname !== '127.0.0.1' || location.protocol !== 'http:' ||
      typeof AbortController === 'undefined' || typeof ReadableStream === 'undefined') return;
  let controller, retry, leaving = false, generation = 0;
  async function connect() {
    const current = ++generation;
    controller = new AbortController();
    const signal = controller.signal;
    let reconnect = true;
    try {
      const status = await fetch(location.pathname, {method: 'HEAD', cache: 'no-store', signal});
      if (leaving || current !== generation) return;
      if (status.headers.get('X-Qiaoqiao-Lifecycle') !== 'stream-v1') { reconnect = false; return; }
      const response = await fetch('/__qiaoqiao_local__/live', {
        headers: {'X-Qiaoqiao-Page': '1'}, cache: 'no-store', signal
      });
      if (response.status === 204) { reconnect = false; return; }
      if (!response.ok || !response.body) return;
      const reader = response.body.getReader();
      while (!(await reader.read()).done) { /* Drain the native connection, including in background tabs. */ }
    } catch { /* Connection failures must not interrupt the game. */ }
    finally {
      if (reconnect && !leaving && current === generation) retry = setTimeout(connect, 1000);
    }
  }
  addEventListener('pagehide', () => {
    leaving = true; generation++;
    clearTimeout(retry);
    if (controller) controller.abort();
  });
  addEventListener('pageshow', event => {
    if (event.persisted) { leaving = false; connect(); }
  });
  connect();
})();
