function* EnumerateObjectProperties(obj) {
  const visited = new Set()
  console.log(Reflect.ownKeys(obj))
  // 获取对象自身的属性键组成的数组。
  for (const K in Reflect.ownKeys(obj)) {
    if (typeof K === 'symbol') {
      continue
    }
    // 获取存在对象身上的属性（不包括原型链）
    const desc = Reflect.getOwnPropertyDescriptor(obj, K)
    if (desc) {
      visited.add(K)
      if (desc.enumerable) {
        yield K
      }
    }
  }
  //  静态方法返回指定对象的原型（即内部 [[Prototype]] 属性的值）
  const proto = Reflect.getPrototypeOf(obj)
  //   console.log(proto, 'proto')
  if (proto === null) return
  for (const protoKey of EnumerateObjectProperties(proto)) {
    if (!visited.has(protoKey)) yield protoKey
  }
}

// const obj = { a: '100', b: 200, c: Symbol('999') }
// const arr = [2, 9, 5, 8]
// let a = EnumerateObjectProperties(arr)
// // console.log(a.next().value)
// console.log(a.next().value)
// a.next().value
// a.next().value

/* 
  ownKeys: 返回自身的属性键组成的数组。
  ownKeys(target){ return [...] } 。 target:proxy代理的对象
  在ownKeys陷阱中，代理对象新增的属性，必须在数组中返回,即使是不可枚举的属性。
  代理对象原有的属性，被拦截后可以自行返回
*/

const obj = { foo: 1, b: Symbol('syb') }
const ITERATE_KEY = Symbol()
const p = new Proxy(obj, {
  ownKeys(target) {
    // console.log(target, 'target')
    // 得到对象key组成的数组
    let k = Reflect.ownKeys(target)
    Object.defineProperty(target, 'bar', {
      value: 'some value',
      enumerable: true,
    })
    // return k
    /* 
    在你的代码中，通过Object.defineProperty(target, 'dsa', { value: 'some value', enumerable: true })添加了一个属性 'dsa' 并将其设置为可枚举。
    然而，即使这个属性被设置为可枚举，ownKeys 陷阱中必须显式地将其返回，因为 ownKeys 的目的是定义对象自身的键。
    ownKeys 陷阱负责返回一个对象自身的所有键，包括不可枚举的键。默认情况下，Object.defineProperty 创建的属性是不可枚举的，
    因此它们不会在 for...in 循环中被迭代。尽管在这个例子中我们将其设置为可枚举，但 ownKeys 仍然需要明确返回这个键。
    如果 ownKeys 不返回添加的键，那么它将不会出现在 Reflect.ownKeys 的结果中，因此也不会被 for...in 循环迭代。
    这是 ownKeys 陷阱设计的一部分，以确保它能够控制对象自身键的显式列表。
    */
    // 原有的属性
    return ['bar']
    // return K
  },
})

for (const key in p) {
  console.log(p[key])
}
for (const key in p) {
  console.log(p[key])
}
for (const key in p) {
  console.log(p[key])
}
