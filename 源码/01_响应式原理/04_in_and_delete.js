// proxy 代理对象。对原始方法 in 和 delete 的拦截处理
const obj = {
  bar: 5,
  get foo() {
    return this.bar
  },
}

// console.log(Reflect.get(obj, 'foo', { bar: 6, foo: 999 }))
const p = new Proxy(obj, {
  //拦截 delete 关键字触发函数（delete p.xx 触发）
  deleteProperty(target, key) {
    console.log('target[key]', target, key)
    return Reflect.deleteProperty(target, key)
  },
  //拦截 in 关键字触发函数
  has(target, key) {
    console.log(target, key)
    for (const k in target) {
      if (k === key) {
        return true
      }
    }
    return false
  },
})

console.log(p.foo)
delete p.foo
console.log(p.foo)
console.log('o' in p)
console.log(typeof obj.bar)

let obj2 = { a: '100' }
let obj3 = [6, 6, 6, 6, 6]
const g = Reflect.getOwnPropertyDescriptor(obj, 'z')
const g2 = Reflect.getOwnPropertyDescriptor(obj2, 'length')
console.log(g, 'g', g2)
