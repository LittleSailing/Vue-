// let obj = { name: 'John', age: 30, foo() {} }
// let arr = [1]
// let dataProxy = new Proxy(arr, {
//   get(target, key, receiver) {
//     return Reflect.get(target, key, receiver)
//   },
// })
// console.log(Object.prototype.toString.call(dataProxy)) //返回值 [object Array]

// var myObject = {
//   foo: 1,
//   bar: 2,
//   baz() {
//     console.log(this, 'this')
//     return this.foo + this.bar
//   },
// }
// let _this = null
// var myReceiverObject = {
//   foo: 4,
//   bar: 4,
//   get fn() {
//     Reflect.get(myObject, 'baz', myReceiverObject)()
//   },
// }
// myReceiverObject.fn
// console.log()
// Reflect.get(myObject, 'bar') // 2
// let obj = {}
// const p1 = new Proxy(obj, {})
// const p2 = new Proxy([p1], {})

// console.log(p2.includes(p1))

// argument 是迭代器对象
// const set = new Set([1, 2, 3])
// console.log(set.values === set[Symbol.iterator])
// const map = new Map([['a', 'b']])
// console.log(map.entries === map[Symbol.iterator])

const obj = { a: { s: 100 } }

// let v = obj['a']
// v.v = 1000

let v = Reflect.get(obj, 'a')
v.v = 1000
console.log(obj)
