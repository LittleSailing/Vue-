// const obj = { a: 1 }
// const proxy = new Proxy(obj, {
//   get(target, key, receiver) {
//     return receiver
//   },
// })
// console.log(proxy.x === proxy) //true

// 对map的代理
const map = new Map([
  ['a', 10],
  ['b', 50],
])
function reactiveMap(map) {
  return new Proxy(map, {
    get(target, key, receiver) {
      //  receiver是proxy对象
      // 字符串属性
      if (key === 'size') {
        return Reflect.get(target, key, target)
      }
      // 代理函数 target 是原始对象
      return target[key].bind(target)
    },
  })
}
const proxy = reactiveMap(map)
// console.log(proxy.size)
console.log(proxy.get('a'))
