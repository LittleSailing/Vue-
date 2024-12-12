const bucket = new WeakMap();
let activeEffect = null;


function cleanup(effectFn) {
  for(let i = 0; i < effectFn.deps.length; i++) {
    const depSet = effectFn.deps[i];
    depSet.delete(effectFn)
  }
  effectFn.deps.length = 0
}

function effect(cb) {
  const effectFn = () => {
    cleanup(effectFn)
    activeEffect = effectFn;
    cb();
  };
  effectFn.deps = [];
  effectFn();
}

function track(target, key) {
  if (!activeEffect) return;
  let depsMap = bucket.get(target);
  if (!depsMap) bucket.set(target, (depsMap = new Map()));
  let depsSet = depsMap.get(key);
  if (!depsSet) depsMap.set(key, (depsSet = new Set()));
  depsSet.add(activeEffect);
  activeEffect.deps.push(depsSet);
}

function trigger(target, key) {
  let depsMap = bucket.get(target);
  if (!depsMap) return;
  let depsSet = depsMap.get(key);
  depsSet &&
    depsSet.forEach((effectFn) => {
      effectFn();
    });
}

function reactive(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      let res = Reflect.get(target, key, reactive);
      track(target, key);
      return res;
    },

    set(target, key, value, receiver) {
      let res = Reflect.set(target, key, value, receiver);
      trigger(target, key);
      return true;
    },
  });
}
