// Fil d'un processeur de la machine z/Architecture (un fil par processeur, page isolée) :
// le module à mémoire partagée (pkg-mt) est initialisé sur la mémoire de worker.js, puis
// le processeur tourne (cpu_thread) jusqu'à l'arrêt de la machine.
//
// Message reçu : {module, memory, ptr, idx, version}; envoyé : {type: 'done', idx}.

self.onmessage = async ({ data }) => {
  const { initSync, cpu_thread } = await import(`./pkg-mt/ibmz_web.js${data.version}`);
  initSync({ module: data.module, memory: data.memory, thread_stack_size: 4 << 20 });
  cpu_thread(data.ptr, data.idx);
  self.postMessage({ type: 'done', idx: data.idx });
};
