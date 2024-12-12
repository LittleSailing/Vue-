import { MyEffect } from "./01_effect.js";

const data = { text: "hello", bar: 1, a: 100, b: 200 };
const { obj, track, trigger, effect } = MyEffect(data);
function computed(getter) {
  // 缓存 effect 副作用函数
  let value = null;
  // 脏
  let dirty = true;
  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      if (!dirty) {
        // 计算属性变量改变时 将脏改为true
        dirty = true;
        trigger(obj, "value");
      }
    },
  });

  const obj = {
    get value() {
      if (dirty) {
        dirty = false;
        value = effectFn();
      }
      // 副作用函数嵌套时需要触发get才会执行，所以需要手动收集依赖
      track(obj, "value");
      return value;
    },
  };
  return obj;
}
const sum = computed(() => {
  return obj.a + obj.b;
});
effect(() => {
  console.log(sum.value, "sum");
});

obj.a++;
