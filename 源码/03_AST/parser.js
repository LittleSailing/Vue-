// parse 的实现原理与状态机
const str = '<div><p>Vue</p><p>Template</p></div>'

/**
 *  状态机解析过程: 解析 '<p>vue</p>'
 *
 *  初始状态1 => 读取<,进入 => 标签开始状态2        : <
 *  标签开始状态2 => 读取p,进入 => 标签名称状态3    : p
 *  标签名称状态3 => 读取>,移回 => 初始状态1        : >   => 记录标签名 p 的名称 <p>
 *  初始状态1 => 读取v,进入 => 文本状态4            : v
 *  文本状态4 => 读取u                              : u
 *  文本状态4 => 读取e                              : e
 *  文本状态4 => 读取<,进入 => 标签开始状态2        : <   => 记录文本状态 4 下产生内容 vue
 *  标签名称状态2 => 读取/,进入 => 结束状态5        : /
 *  结束状态5 => 读取p,进入 => 结束标签名称6状态    : p
 *  结束标签名称6状态 => 读取>,移回 => 初始状态1    ：>   => 记录结束标签名称状态 6 ，生成的结束标签名称
 *
 */

const State = {
  initial: 1, // 初始状态
  tagOpen: 2, // 标签开始状态
  tagName: 3, // 标签名称状态
  text: 4, // 文本状态
  tagEnd: 5, // 结束标签状态
  tagEndName: 6, // 结束标签名称状态
}

// 一个辅助函数判断是否是字母
function isAlpha(char) {
  return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z')
}

// 状态机
// 接收模板字符串作为参数，并将模板切割为 Token 返回
/**
 '<div><p>Vue</p><p>Template</p></div>'   
 转换为 =>
[
  { type: 'tag', name: 'div' },
  { type: 'tag', name: 'p' },
  { type: 'text', content: 'Vue' },
  { type: 'tagEnd', name: 'p' },
  { type: 'tag', name: 'p' },
  { type: 'text', content: 'Template' },
  { type: 'tagEnd', name: 'p' },
  { type: 'tagEnd', name: 'div' }
]
*/
function tokenize(str) {
  // 状态机当前状态：初始状态
  let currentState = State.initial
  // 用于换成字符
  const chars = []
  // 生成的 Token 会存储到 tokens 数组中，并作为函数
  const tokens = []
  // 使用 while 循环开启自动机,只要模板字符串没有消费尽，自动机就会一直运行
  while (str) {
    // 查看第一个字符串
    const char = str[0]
    switch (currentState) {
      // 状态机当前处于初始状态
      case State.initial:
        if (char === '<') {
          // 1.状态机切换到标签开始状态
          currentState = State.tagOpen
          // 2.消费字符 <
          str = str.slice(1)
        } else if (isAlpha(char)) {
          // 1.遇到字母，切换到文本状态
          currentState = State.text
          // 2.字符缓存到 chars 数组
          chars.push(char)
          // 3.消费字符
          str = str.slice(1)
        }
        break
      // 状态机当前处于标签开始状态
      case State.tagOpen:
        if (isAlpha(char)) {
          // 1.状态机切换到标签名称状态
          currentState = State.tagName
          // 2.字符缓存到 chars 数组
          chars.push(char)
          // 3.消费字符
          str = str.slice(1)
        } else if (char === '/') {
          // 1.遇到字符/ ,切换到结束标签状态
          currentState = State.tagEnd
          // 2.消费字符串/
          str = str.slice(1)
        }
        break
      // 状态机当前处于标签名称状态
      case State.tagName:
        // 如果是字符串
        if (isAlpha(char)) {
          // 1.遇到字母，当前处于标签名称状态，不需要切换直接存入chars
          chars.push(char)
          // 2.消费字符
          str = str.slice(1)
        } else if (char === '>') {
          // 1.遇到 > ,状态机回到初始阶段
          currentState = State.initial
          // 2.同时创建一个标签 Token ，添加到 tokens 数组中
          // 此时 chars 数组中缓存的字符串的字符就是标签的名称
          tokens.push({
            type: 'tag',
            name: chars.join(''),
          })
          // 3.消费完毕，清空 chars 数组
          chars.length = 0
          // 4.消费 >
          str = str.slice(1)
        }
        break
      // 状态机处于文本状态
      case State.text:
        // 当前还是字母
        if (isAlpha(char)) {
          // 1.遇到字母,不改变状态,直接存入charts
          chars.push(char)
          // 2.消费字符串
          str = str.slice(1)
        } else if (char === '<') {
          // 1.修改状态为 tagOpen 标签开始状态
          currentState = State.tagOpen
          // 2.此时 chars 数组中的字符就是文本内容
          tokens.push({
            type: 'text',
            content: chars.join(''),
          })
          // 3.清空 chars
          chars.length = 0
          //  4.消费当前字符串
          str = str.slice(1)
        }
        break
      case State.tagEnd:
        if (isAlpha(char)) {
          // 1. 遇到字母，切换到结束标签名称状态
          currentState = State.tagEndName
          // 2. 将当前字符缓存到 chars 数组
          chars.push(char)
          // 3. 消费当前字符
          str = str.slice(1)
        }
        break
      // 状态机当前处于结束标签名称状态
      case State.tagEndName:
        if (isAlpha(char)) {
          // 1. 遇到字母，不需要切换状态，但需要将当前字符缓存到 chars数组
          chars.push(char)
          // 2. 消费当前字符
          str = str.slice(1)
        } else if (char === '>') {
          // 1. 遇到字符 >，切换到初始状态
          currentState = State.initial
          // 2. 从 结束标签名称状态 --> 初始状态，应该保存结束标签名称Token
          // 注意，此时 chars 数组中缓存的内容就是标签名称
          tokens.push({
            type: 'tagEnd',
            name: chars.join(''),
          })
          // 3. chars 数组的内容已经被消费，清空它
          chars.length = 0
          // 4. 消费当前字符
          str = str.slice(1)
        }
        break
    }
  }
  // 返回tokens
  return tokens
}

// string 解析成 token
// const tokens = tokenize(str)
// console.log(tokens)

// parse 函数手机模板作为参数
function parse(str) {
  // 1.对模板进行标记化，得到tokens
  const tokens = tokenize(str)
  // 2.创建 Root 根节点
  const root = {
    type: 'Root',
    children: [],
  }
  // 3.创建 elementStack 栈，起初只有 Root 根节点
  const elementStack = [root]
  // 4.开启一个 while 循环扫描 tokens，直到所有 Token 都被扫描完毕为止
  while (tokens.length) {
    // 获取当前栈顶节点作为父节点 parent
    const parent = elementStack[elementStack.length - 1]
    // 当前扫描 token
    const t = tokens[0]
    switch (t.type) {
      case 'tag':
        const elementNode = {
          type: 'Element',
          tag: t.name,
          children: [],
        }
        // 将其添加到父级节点的children中
        parent.children.push(elementNode)
        // 将当前节点压入栈
        elementStack.push(elementNode)
        break
      case 'text':
        const TextNode = {
          type: 'Text',
          content: t.content,
        }
        parent.children.push(TextNode)
        break
      case 'tagEnd':
        // 遇到结束标签，栈顶节点弹出
        elementStack.pop()
        break
    }
    //  消费已经扫描过的 token
    tokens.shift()
  }

  return root
}

// 节点信息（工具函数）
function dump(node, indent = 0) {
  const type = node.type
  const desc =
    node.type === 'Root'
      ? ''
      : node.type === 'Element'
      ? node.tag
      : node.content
  // 打印节点的类型和描述信息
  console.log(`${'-'.repeat(indent)}${type}: ${desc}`)
  // 递归地打印子节点
  if (node.children) {
    node.children.forEach((n) => dump(n, indent + 2))
  }
}
const ast = parse('<div><p>Vue</p><p>Template</p></div>')

function traverseNode(ast, context) {
  // 当前节点，ast 本身就是 Root 节点
  const currentNode = ast
  if (currentNode.type === 'Element' && currentNode.tag === 'p') {
    currentNode.tag = 'h1'
  }
  // 如果有子节点，则递归地调用 traverseNode 函数进行遍历
  const children = currentNode.children
  if (children) {
    for (let i = 0; i < children.length; i++) {
      traverseNode(children[i])
    }
  }
}
// 封装 transform 函数，用来对 AST 进行转换
function transform(ast) {
  // 调用 traverseNode 完成转换
  traverseNode(ast)
  // 打印 AST 信息
  console.log(dump(ast))
}

dump(ast)
transform(ast)
// dump(ast)
