const template = `
<div>
   <h1 v-if="ok">vue 模板</h1>
</div>`

const templateAST = parse()

//1.解析器 parse 会把字符串模板解析成 AST(vnode) 返回
const parse = (temp) => {}

// 2.当拥有 AST 模板之后需要对模板进行语义分析，并对AST模板进行转换
// => 检查 v-if、v-else 是否存在相符的v-if
// => 属性值是否是静态，是否是常量等
// => 插槽是否引用上层变量

// Vue.js 模板编译器的最终目标是生成渲染函数，而渲染函数本质上是 JavaScript 代码
const jsAST = transform(parse)
const transform = (ast) => {}

// 3. 有了 JavaScript AST 后,就可以根据它生成渲染函数了
const code = generate(jsAST)
const generate = (ast) => {}

// 执行过程
// const templateAST = parse(template)
// const jsAST = transform(templateAST)
// const code = generate(jsAST)
