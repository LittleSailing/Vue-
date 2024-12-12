const obj = { a: 'aaa', b: 'bbb' }

const p = new Proxy(obj, {
  deleteProperty(target, p) {
    const del = Reflect.deleteProperty(target, 'b')
    console.log(del, 'del')
    return del
  },
})
console.log(obj)
delete p.a
console.log(obj)
