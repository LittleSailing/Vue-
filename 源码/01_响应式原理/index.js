// const arr = [1, 2, 4, 8, 6, 5]

// function* generate(arr) {
//   for (const key in arr) {
//     yield arr[key]
//   }
//   console.log('不管怎样，我不会显示')
// }

// const ergodic = generate(arr)

// class A {
//   a = '100'
// }

// class B extends A {
//   b = '200'
// }

// const b = new B()
// console.log(b, 'b')
// console.log(b.__proto__ === B.prototype)
// console.log(B.__proto__ === A)
// console.log(A.__proto__ === Function.prototype)

// const obj = {}
// const obj2 = { a: 'aa', b: 'bb' }

// const p2 = new Proxy(obj, {
//   set(target, key, newVal, receiver) {
//     console.log(target, key, newVal, receiver)
//     const res = Reflect.set(target, key, newVal, receiver)
//     return res
//   },
// })
// const p = new Proxy(obj2, {})
// Object.setPrototypeOf(p, p2)
// p.a = 2
// console.log(p.a)

// proxy 调用foreach会对数组length读取
// let arr = [1, 2, 3]
// let a = new Proxy(arr, {
//   get(target, key, receiver) {
//     console.log('我调用了 key', key)
//     return target[key]
//   },
// })
// // console.log(Array.isArray(arr), Number(a))

// a.forEach((i, index) => {
//   console.log(i, 'index', index)
// })
// 迭代器
// const obj = {
//   val: 100,
//   val2: 10,
//   [Symbol.iterator]() {
//     const keys = Object.keys(obj)
//     let index = 0
//     return {
//       next() {
//         console.log('我调用了')
//         if (index < keys.length) {
//           let key = keys[index++]
//           let newObj = { [key]: obj[key] + 10 }
//           return {
//             value: newObj,
//             done: false,
//           }
//         }
//         return {
//           done: true,
//         }
//       },
//     }
//   },
// }
// for (const i of obj) {
//   console.log(i)
// }
// for (const key in obj) {
//     console.log('key', key, obj[key])
// }

// let arr = [1, 2, 5, 7]
// arr[Symbol.iterator] = function () {
//   const target = this
//   const keys = Object.keys(target)
//   const len = target.length
//   let index = 0
//   return {
//     next() {
//       let key = keys[index]
//       let obj = { [key]: target[index] }
//       return {
//         value: index < len ? obj : undefined,
//         done: index++ >= len,
//       }
//     },
//   }
// }
// for (const i of arr) {
//   console.log(i)
// }

// const arrayInstrumentations = {
//   // 重写includes方法
//   includes() {},
// }

// reactive 数组二次代理造成代理对象丢失问题
// const reactiveMap = new Map()
// function reactive(obj) {
//   const existionProxy = reactiveMap.get(obj)
//   if (existionProxy) return existionProxy
//   const proxy = createReactive(obj)
//   reactiveMap.set(obj, proxy)
//   return proxy
// }

// function createReactive(obj) {
//   return new Proxy(obj, {
//     get(target, key, receiver) {
//       const res = Reflect.get(target, key, receiver)
//       if (typeof res === 'object' && res !== null) {
//         return reactive(res)
//       }
//       console.log('我被调用了 key:', target, key, receiver, this)
//       return res
//     },
//     set(target, key, newVal, receiver) {
//       // console.log('set调用了', newVal)
//       const res = Reflect.set(target, key, newVal, receiver)
//       return res
//     },
//   })
// }

// const obj = { a: 1, b: 2 }
// const obj2 = { foo: 100 }

// const arr = reactive([obj, obj2])
// // arr[1].foo
// // console.log(arr[0] == arr[0])
// console.log(arr.includes(arr[0]))

// const obj = {
//   a: 1,
//   fn: function (...arg) {
//     console.log(this, 'fn')
//     // console.log(arg, 'fn')
//     return '1'
//   },
// }
// Reflect.get(obj, 'fn', [1, 2, 3])()
// console.log()

// const arrayfn = {
//   a: 1,
//   fn(...arg) {
//     console.log(this, 'this') // 使用 this 访问 receiver 对象
//     console.log(arg, 'arg')
//     return this.a
//   },
// }
// const arrayfn2 = {
//   a: 1000,
// }

// const arr = [o, 1, 2]
// const sideReceiver = { index: 100 }

// let ProxyThis
// const p = new Proxy(arr, {
//   get(target, key, receiver) {
//     ProxyThis = this
//     const hasArray = arrayfn.hasOwnProperty(key)
//     console.log('key', typeof key, hasArray)
//     if (hasArray) {
//       return Reflect.get(arrayfn, key, arrayfn2)
//     }

//     return true
//   },
// })

// console.log(p.fn(o))

// const obj = {
//   a: 5,
//   b() {
//     console.log(this, 'this')
//     // return
//   },
// }
// const obj2 = {
//   foo: 'foo',
// }

// const proxy = new Proxy(obj2, {
//   get(target, key, receiver) {
//     // console.log(receiver)
//     // console.log(receiver === obj2)
//     // console.log(target === obj2)
//     // Reflect.get(obj, 'b')
//     return receiver
//   },
// })

// console.log(proxy.foo === proxy)

// const receiver1 = { a: 20 }
// const receiver2 = { a: 30 }
// console.log(Reflect.get(obj, 'b')()) // 输出：15
// console.log(Reflect.get(obj, 'b', receiver1)(receiver1)) // 输出：25
// console.log(Reflect.get(obj, 'b', receiver2)) // 输出：35
// const proxy = new Proxy([6, 6, 6], {
//   get(target, key, receiver) {
//     const res = Reflect.get(obj, 'b', receiver1)
//     return res
//   },
// })
// console.log(proxy.a())

const m = new Map([
  ['key1', 'value1'],
  ['key2', 'value2'],
])

for (const [k, v] of m.entries()) {
  console.log(k, v)
}
