import {
  ref,
  effect,
  reactive,
  shallowReactive,
  shallowReadonly,
  proxyRefs,
} from './xys-daima.js'
const objectToString = Object.prototype.toString
const toTypeString = (value) => objectToString.call(value)
const toRawType = (value) => {
  // 从类似“[object string]”的字符串中提取“string”
  return toTypeString(value).slice(8, -1)
}

// 任务缓存队列（缓存组件）
const queue = new Set()
// 一个标志，代表正在刷新任务队列
let flushing = false
// 创建一个立即 resolve 的 Promise 任务队列
const p = Promise.resolve()
function queueJob(job) {
  console.log(queue, 'queue')
  // 添加任务到任务队列中
  queue.add(job)
  // 刷新任务，设置 flushing 标志为 true
  flushing = true
  // 遍历任务队列
  p.then(() => {
    try {
      // 执行任务队列中的任务
      queue.forEach((job) => job())
    } finally {
      // 重置状态
      flushing = false
      queue.clear = 0
    }
  })
}

// 全局变量
let currentInstance = null
// 生命周期 onMounted
function onMounted(fn) {
  if (currentInstance) {
    // 将生命周期函数添加到 instance.mounted 数组中
    currentInstance.mounted.push(fn)
  } else {
    console.error('onMounted 只能在 setup 函数中调用')
  }
}
// 存储初始化组件实例(生命周期钩子需要维护实例)
function setCurrentInstance(instance) {
  currentInstance = instance
}

// 1.5 属性类型检测，对应修改
function shouldSetAsProps(el, key, value) {
  // 优先检测属性是否是 DOM properties
  if (key === 'form' && el.tagName === 'INPUT') {
    return false
  }
  // 判断是否是 HTML attributes
  return key in el
}

// 渲染器
function createRenderer(options) {
  const { createElement, setElement, insert, patchProps, createText, setText } =
    options

  /**
   *  描述一个文本节点
   *  Text => symbol()
   *  代码注释 => symbol()
   *  片断 => Fragment => symbol()
   *
   *  虚拟dom
   *  {
   *    type:Text
   *    children:'这是文本内容'
   *  }
   *
   *  虚拟dom
   *  {
   *    type:Comment
   *    children::'这是注释内容'
   *  }
   *
   *  片断为了解决 vue ul>li 组件的模板不允许存在多个根节点
   *  用片断的方式表示多层结构
   *  ui => li、li、li
   *  {
   *    type:'ul',
   *    children:[{
   *      type:Fragment,
   *      children:[
   *        {type:'li',children:'1'},
   *        {type:'li',children:'2'},
   *        {type:'li',children:'3'},
   *      ]
   *    }]
   *  }
   *
   *
   */

  const Text = Symbol()
  const Fragment = Symbol()

  // 渲染 vnode 虚拟dom , container 真实 dom
  function render(vnode, container) {
    // 1.如果传入了虚拟 dom ,和旧的 dom 一起传入 patch 打补丁
    if (vnode) {
      patch(container._vnode, vnode, container)
    }
    // 2. 新的 vnode 不存在
    else {
      //  2.1 旧的 vnode 存在
      if (container._vnode) {
        //  2.2 卸载真实 dom
        unmount(container._vnode)
      }
    }
    // 3.吧虚拟 dom  vnode 放到 dom 的 _vnode 属性上
    container._vnode = vnode
  }

  // 1.1 打补丁 (比较新旧dom) n1 旧的 n2 新的
  function patch(n1, n2, container, anchor) {
    // 1.3 如果旧的虚拟 dom 存在 ,对比新旧虚拟 dom 的类型不同卸载
    if (n1 && n1.type !== n2.type) {
      unmount(n1)
      n1 = null
    }

    const { type } = n2
    if (typeof type === 'string') {
      // 旧的 vonde不存在，把新的 vnode 渲染到 container 下面
      if (!n1) {
        mountElement(n2, container, anchor)
      } else {
        // 更新
        patchElement(n1, n2)
      }
    } else if (type === Text) {
      // 如果没有旧节点,生成text节点渲染到dom上
      if (!n1) {
        // 创建文本 dom
        const el = (n2.el = createText(n2.children))
        // 将文本节点插入dom上
        insert(el, container)
        // 如果有旧节点，修改旧节点text
      } else {
        // 如果旧的 vnode 存在，只需要使用新文本节点的文本内容更新旧文本节点
        const el = (n2.el = n1.el)
        if (n2.children !== n1.children) {
          setText(el.nodeValue, n2.children)
        }
      }
    } else if (type === Fragment) {
      if (!ni) {
        n2.children.forEach((el) => {
          patch(null, c, container)
        })
      } else {
        patchChildren(n1, n2, container)
      }
    }
    // 如果是一个组件
    else if (typeof type === 'object') {
      if (!n1) {
        mountComponent(n2, container, anchor)
      } else {
        patchComponent(n1, n2, anchor)
      }
    } else if (type === '') {
    }
  }

  // 渲染一个真实 dom
  function mountElement(vnode, container, anchor) {
    // 渲染 DOM
    // 为虚拟dom创建一个dom, 虚拟dom的 el 属性 vnode.el 添加创建的dom 与真实dom建立联系
    const el = (vnode.el = createElement(vnode.type))
    // 如果children是string 直接渲染成 text
    if (typeof vnode.children === 'string') {
      setElement(el, vnode.children)
      // 如果有子元素，重复打补丁
    } else if (Array.isArray(vnode.children)) {
      vnode.children.forEach((child) => {
        patch(null, child, el)
      })
    }

    // 添加 DOM 属性
    if (vnode.props) {
      // 遍历虚拟dom 属性
      for (const key in vnode.props) {
        // 获取属性值
        let value = vnode.props[key]
        //  修改 dom 属性方法，封装成单独的函数
        patchProps(el, key, null, value)
      }
    }

    // 把创建的 el 添加到 container 中
    insert(el, container, anchor)
  }

  // 更新 dom   n1旧的 n2新的
  function patchElement(n1, n2) {
    const el = (n2.el = n1.el)
    const oldProps = n1.props
    const newProps = n2.props
    // 1.更新 props
    // 1.1对比新dom的props的key在旧的dom中存在吗，存在patchProps更新属性
    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProps(el, key, oldProps[key], newProps[key])
      }
    }
    // 1.2对比旧的props的key在新的props中不存在，patchProps 清除props属性
    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProps(el, key, oldProps[key], null)
      }
    }
    // 2.更新children
    patchChildren(n1, n2, el)
  }

  /**
   *  更新 虚拟dom children
   * children => string
   * children => array
   * children => null
   */
  function patchChildren(n1, n2, container) {
    // 1. 判断新子节点是否是文本
    if (typeof n2.children === 'string') {
      /**
       * 旧子节点有三种可能: 没有子节点，string， 一组array。
       * 只有当旧子节点是 array 一组节点时，才需要逐个卸载，其他情况什么都不用做
       */
      if (Array.isArray(n1)) {
        n1.children.forEach((child) => {
          unmount(child)
        })
      }
      // 最后将新文本渲染到container中
      setElement(container, n2.children)
    }
    // 2.如果新子节点是数组
    else if (Array.isArray(n2.children)) {
      // 2.1.如果旧子节点也是数组，使用diff算法得出差异后更新
      if (Array.isArray(n1.children)) {
        // 双端diff算法,获取新旧dom子元素
        const oldChildren = n1.children
        const newChildren = n2.children
        // 定义新旧dom首尾index
        let oldStartIdx = 0
        let newStartIdx = 0
        let oldEndIdx = oldChildren.length - 1
        let newEndIdx = newChildren.length - 1
        // 索引值指向的vnode节点
        let oldStartNode = oldChildren[oldStartIdx]
        let oldEndNode = oldChildren[oldEndIdx]
        let newStartNode = newChildren[newStartIdx]
        let newEndNode = newChildren[newEndIdx]

        while (newStartIdx <= newEndIdx && oldStartIdx <= oldEndIdx) {
          // 如果旧的 dom 节点是 undefined 跳过该节点
          if (!oldStartNode) {
            oldStartNode = [++oldStartIdx]
          } else if (!oldEndNode) {
            oldEndNode = [--oldEndIdx]
          }
          // 新头旧头
          else if (oldStartNode.key === newStartNode.key) {
            patch(oldStartNode, newStartNode, container)
            oldStartNode = oldChildren[++oldStartIdx]
            newStartNode = newChildren[++newStartIdx]
          }
          // 新尾旧尾
          else if (oldEndNode.key === newEndNode.key) {
            patch(oldEndNode, newEndNode, container)
            oldEndNode = oldChildren[--oldEndIdx]
            newEndNode = newChildren[--newEndIdx]
          }
          // 旧头新尾
          else if (oldStartNode.key === newEndNode.key) {
            // 打补丁
            patch(oldStartNode, newEndNode, container)
            // 更新dom 位置
            insert(oldStartNode.el, container, oldEndNode.el.nextSibling)

            // 更新双指针
            oldStartNode = oldChildren[++oldStartIdx]
            newEndNode = newChildren[--newEndIdx]
          }
          // 旧尾新头
          else if (oldEndNode.key === newStartNode.key) {
            console.log('调用了', oldEndNode, newStartNode)
            // 打补丁
            patch(oldEndNode, newStartNode, container)
            // 更新dom 位置
            insert(oldEndNode.el, container, oldStartNode.el)

            // 更新双指针
            oldEndNode = oldChildren[--oldEndIdx]
            newStartNode = newChildren[++newStartIdx]
          } else {
            // 遍历旧的一组子节点，试图寻找与新的一组子节点的头部节点相同的节点
            const idxInOld = oldChildren.findIndex((node) => {
              return node?.key === newStartNode.key
            })
            // 如果找到了，打补丁，并且更新双指针
            if (idxInOld > 0) {
              // 需要移动的旧节点
              const vnodeToMove = oldChildren[idxInOld]
              // 更新旧node
              patch(vnodeToMove, newStartNode, container)
              // 新dom的key是第一个，所以找到旧dom后可以直接添加到第一个
              insert(vnodeToMove.el, container, oldStartNode.el)
              // 吧旧old设置为null
              oldChildren[idxInOld] = undefined
              // 更新new节点到下一个
              newStartNode = newChildren[++newStartIdx]
            } else {
              // 该元素旧节点没有找到说明是新节点，挂载到旧dom头部
              patch(null, newStartNode, container, oldStartNode.el)
            }
            // 新dom 开始下标后移一位
            newStartNode = newChildren[++newStartIdx]
          }
        }

        // 下标 和结束下标相同时，可能忽略添加操作。 需要在外部再次确认
        if (oldEndIdx < oldStartIdx && newStartIdx <= newEndIdx) {
          for (let i = newStartIdx; i < newEndIdx; i++) {
            patch(null, newChildren[newStartIdx], container, oldStartIdx.el)
          }
        } else if (newEndIdx < newStartIdx && oldStartIdx <= oldEndIdx) {
          for (let i = oldStartIdx; i < oldEndIdx; i++) {
            unmount(oldChildren[i])
          }
        }
      }
      // 2.2这里旧子节点要么是 null 要么就是文本 string
      else {
        // 1 文本清空
        setElementText(container, '')
        n2.children.forEach((c) => {
          patch(null, c, container)
        })
      }
    }
    // 3.说明新子节点不存在
    else {
      // 1.旧子节点是一组节点，遍历卸载
      if (Array.isArray(n1.children)) {
        n1.children.forEach((c) => unmount(c))
      }
      // 2.旧子节点是文本节点清空内容即可
      else if (typeof n1.children === 'string') {
        setElementText(container, '')
      }
    }
  }

  //2.2 卸载 dom
  function unmount(vnode) {
    if (vnode.type === Fragment) {
      vnode.children.forEach((c) => {
        unmount(c)
      })
      return
    } else if (typeof vnode.type === 'object') {
      unmount(vnode.component.subTree)
    }

    // 根据 vnode 获取要卸载的真实 DOM 元素的父元素
    const parent = vnode.el.parentNode
    if (parent) {
      parent.removeChild(vnode.el)
    }
  }

  // 服务端渲染
  function hydrate(vnode, container) {}
  // 组件的渲染
  /**
   * vnode.props 父组件虚拟dom props
   * vnode.type.props 组件实例props
   */
  function mountComponent(vnode, container, anchor) {
    // 获取组件对象 n2.type
    const componentOptions = vnode.type
    //获取组件的渲染函数 render 的生命周期
    let {
      render,
      data,
      props: propsOption,
      setup,
      beforeCreate,
      created,
      beforeMount,
      mounted,
      beforeUpdate,
      updated,
    } = componentOptions
    /**生命周期 */
    beforeCreate && beforeCreate()
    /* 组件data */
    // state 获取响应式代理 data
    const state = data ? reactive(data()) : null
    // 通过函数解析处最终的props和title数据
    const [props, attrs] = resolveProps(propsOption, vnode.props)
    /** slot 插槽 */
    // 将编译好的对象 children 作为slot即可
    const slots = vnode.children || {}

    // 解决: patch 第一个参数永远是 null 引入生命周期概念
    // 定义组件实例，一个组件实例本质上就是一个对象，包含与组件相关状态
    const instance = {
      // 组件自身状态数据，即 data
      state,
      // 表示组件是否被挂载,初始值 false
      isMounted: false,
      props: shallowReactive(props),
      // 组件渲染内容，子树
      subTree: null,
      // 组件的 slots 实例
      slots,
      // 添加 mounted 数组，用来存储通过 onMounted 函数注册的生命周期钩子
      mounted: [],
    }

    /* 获取定义 emit 函数，它接收数个参数 */
    function emit(event, ...payload) {
      // 约定事件处理名称
      const eventName = `on${event[0].toUpperCase() + event.slice(1)}`
      // 获取组件实例
      const handler = instance.props[eventName]
      // console.log(instance.props, 'instance', handler)
      if (handler) {
        handler(...payload)
      } else {
        console.log('事件不存在')
      }
    }

    /* 组件setup */
    // 主键实例
    // 将emit 函数添加到setupContext中
    const setupContext = { attrs, emit, slots }

    // 调用 setup 之前，设置当前组件实例（存起来）
    setCurrentInstance(instance)

    // 调用 setup 函数，将只读版本的props作为第一个参数值,避免用户修改props
    const setupResult =
      setup && setup(shallowReadonly(instance.props), setupContext)

    //  setup 函数执行完毕后，重置当前组件实例
    setCurrentInstance(null)

    // 获取setup返回的值
    let setupState = null
    // 如果setup 返回的是函数，则将其作为渲染函数
    if (typeof setupResult === 'function') {
      // 报告冲突
      if (render) console.error(`setup 返回渲染函数，render 选项会被忽略`)
      //  setupResult 作为渲染函数
      render = setupResult
    } else {
      // 如果setup 的返回值不是函数，则作为数据状态赋值给setupState
      setupState = setupResult
    }

    // 组件实例设置到 vnode 上，用于后续更新
    vnode.component = instance

    // 渲染上下文对象
    const renderContext = new Proxy(instance, {
      get(t, k, r) {
        // 获取实例身上的 state 和 props
        const { state, props, slots } = t
        // 组件中获取 $slots 返回自身 slots
        if (k === '$slots') {
          return slots
        }

        // 先尝试读取自身状态数据
        if (state && k in state) {
          return state[k]
        } else if (props && k in props) {
          return props[k]
        } else if (setupState && k in setupState) {
          // 渲染上下文需要增加对 setupState 的支持
          return setupState[k]
        } else {
          return '数据不存在'
        }
      },
      set(t, k, v, r) {
        const { state, props } = t
        if (state && k in state) {
          state[k] = v
        } else if (k in props) {
          console.warn(`${k} 是 props 不可以修改`)
        } else if (setupState && k in setupState) {
          console.log('我diaoyongl', k)
          setupState[k] = v
        } else {
          console.error('不存在')
        }
      },
    })

    // 调用 create 改变 this
    created && created.call(renderContext)
    // 放到 effect 中，状态改变
    effect(
      async () => {
        console.log('调用了')
        // 执行渲染函数，获取组件要渲染的内容，即render函数返回的虚拟dom
        // 通过 this 访问组件自身状态数据
        const subTree = render.call(renderContext, renderContext)
        // 如果没有挂载，给它挂载
        if (!instance.isMounted) {
          // 执行 beforeMount 钩子
          beforeMount && beforeMount.call(renderContext)
          // 最后调用 patch 打补丁挂载组所描述的内容
          await patch(null, subTree, container, anchor)
          // 状态:已挂载
          instance.isMounted = true
          // 执行 mounted 生命周期函数
          instance.mounted &&
            instance.mounted.forEach((hook) => hook.call(renderContext))
        }
        // 挂载过，更新组件打补丁
        else {
          // 调用 beforeUpdate 钩子
          beforeUpdate && beforeUpdate.call(renderContext)
          patch(instance.subTree, subTree, container, anchor)
          // 调用 update 钩子
          updated && updated.call(renderContext)
        }
        // 更新组件实例的子树
        instance.subTree = subTree
      },
      { scheduler: queueJob }
    )
  }
  // patch Component 完成子组件更新，父组件更新引起的子组件更新（被动更新）
  function patchComponent(n1, n2, anchor) {
    console.log('patch调用', n1, n2)
    //获取组件实例，即 n1.component,同时让n2.component指向同一个实例
    const instance = (n2.component = n1.component)
    // 获取当前props参数
    const { props } = instance
    // 调用 hasPropsChanged 检测子组件props是否发生变化，如果没有变化，则不需要更新
    if (hasPropsChanged(n1.props, n2.props)) {
      // 调用 resolveProps 重新获取新虚拟dom的props数据和组件props数据相等
      const [nextProps] = resolveProps(n2.type.props, n2.props)
      // 更新 props
      for (const k in nextProps) {
        props[k] = nextProps[k]
      }
      // 删除不存在的 props
      for (const k in props) {
        if (!(k in nextProps)) delete props[k]
      }
    }
  }

  // 对比新旧 props 是否有变化
  function hasPropsChanged(preProps, nextProps) {
    const nextKeys = Object.keys(nextProps)
    // 如果新旧props 数量变了说明有变化
    if (nextKeys.length !== Object.keys(preProps).length) {
      return true
    }

    // 遍历新props，如果新旧props 不一致，说明有变化
    for (let i = 0; i < nextKeys.length; i++) {
      const key = nextKeys[i]
      // 说明有变化
      if (nextProps[key] !== preProps[key]) {
        return true
      }
    }
  }

  // 解析props 数据
  /**
   *  {
   *    type: Object 组件类型
   *    props: {}
   *    children: []
   *    ...
   *  */
  // 对比 vnode.type.props 和 vnode.props 参数是否一致
  // options:n2.type.props 组件的 props 对象
  // propsData:n2.props 虚拟dom的 vnode.props 对象
  function resolveProps(options, propsData) {
    const props = {}
    const attrs = {}
    // 遍历为组件传递 props 数据
    for (const key in propsData) {
      const value = propsData[key]
      /**
       * 以下两种情况 props 数组是合法的
       * 1.父组件为组件传递的props 数据在组件自身 props 选项中有定义，
       * 则将其视为合法的props
       * 2.父组件的 props 数据是 on 开头，说明是一个事件函数 emit 由子组件 emit 触发，
       * 视为合法的props
       * */
      if (key in options || key.startsWith('on')) {
        props[key] = value
      } else {
        // 否则视为 attrs
        attrs[key] = value
      }
    }
    // 返回attrs 和 props 数据
    return [props, attrs]
  }
  return {
    render,
    hydrate,
  }
}

// 处理css class
/**
 *  vue 中 class 声明有两种，在虚拟dom中体现不同。
 *  :class  => {foo:true,bar: false} 对象形式存储
 *  class => 'foo bar' 字符串形式存储
 */
function normalizeClass(value) {
  let res = ''
  if (toRawType(value) === 'String') {
    res = value
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i])
      if (normalized) {
        res += normalized + ' '
      }
    }
  } else if (toRawType(value) === 'Object') {
    for (const name in value) {
      if (value[name]) {
        res += name + ' '
      }
    }
  }
  return res.trim()
}

const renderer = createRenderer({
  createElement(tag) {
    return document.createElement(tag)
  },
  setElement(el, text) {
    el.textContent = text
  },
  insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor)
  },
  patchProps(el, key, preValue, nextValue) {
    // 1.开头以 on 视为事件
    if (/^on/.test(key)) {
      // 2.伪造事件对象
      let invokers = el?._vei || (el._vei = {})
      // 3.伪造事件处理函数 vue event invoker
      let invoker = invokers[key]
      // 4.事件名称，去掉 on 开头
      const name = key.slice(2).toLowerCase()
      // 5.当前是否传入了新的事件
      if (nextValue) {
        // 5.1 传入了新事件 没有 invoker 旧事件。添加dom 点击事件
        if (!invoker) {
          // 1.给 dom 绑定的事件是 invoker ，真正触发的事件是 invoker.value() ，
          // 通过卸载invoker.value修改invoker.value 可以避免更多dom操作
          invoker = el._vei[key] = (e) => {
            // 7.如果事件发生时间早于事件处理函数绑定的事件，则不继续执行
            if (e.timeStamp < invoker.attached) {
              return
            }
            // 2. 如果是数组，说明一个dom事件绑定了多个函数
            if (Array.isArray(invoker.value)) {
              // 执行所有函数
              invoker.value.forEach((fn) => {
                fn(e)
              })
            } else {
              // 对_vei 进行缓存
              // 当伪造的事件处理函数执行时会执行真正的事件处理函数
              invoker?.value(e)
            }
          }
          //  3. 真正的事件函数赋值给 invoker.value 。 nextValue：函数或者是数组函数
          invoker.value = nextValue

          // 存储事件处理函数被绑定的事件
          invoker.attached = performance.now()

          // 绑定 invoker 作为 dom 事件函数
          el.addEventListener(name, invoker)

          // 5.2 传入了新事件 ，有 invoker 旧事件，更新事件函数
        } else {
          // 如果 invoker 存在，意味着更新，只需要更新invoker即可.
          // 解决了重复 removeEvent 删除dom事件的性能问题
          invoker.value = nextValue
        }
      } else if (invoker) {
        // 6.没有新事件删除原有事件
        el.removeEventListener(name, invoker)
      }
    }
    // 如果 key 是 class 使用 className 效率更快
    else if (key === 'class') {
      el.className = nextValue || ''
    }
    // el 判断属性是否是 HTML.attributes 属性。如果属性是 DOM Properties 调用 setAttribute 修改属性
    else if (shouldSetAsProps(el, key, nextValue)) {
      const type = typeof el[key]
      // 如果值是 布尔类型 需要特殊处理 :disable = '' 设置为true
      if (type === 'boolean' && nextValue === '') {
        el[key] = true
      } else {
        el[key] = nextValue
      }
    } else {
      el.setAttribute(key, nextValue)
    }
  },
  createText(text) {
    return document.createTextNode(text)
  },
  setText(el, text) {
    el.nodeValue = text
  },
})

// const vnode = {
//   type: 'div',
//   children: [
//     { type: 'p', children: '1', key: 1 },
//     { type: 'p', children: '2', key: 2 },
//     { type: 'p', children: '3', key: 3 },
//     { type: 'p', children: '4', key: 4 },
//   ],
// }

// const vnode2 = {
//   type: 'div',
//   children: [
//     { type: 'p', children: '4', key: 4 },
//     { type: 'p', children: '3', key: 3 },
//     { type: 'p', children: '2', key: 2 },
//     { type: 'p', children: '1', key: 1 },
//   ],
// }

// vue 2.0 选项api
const MyComponent = {
  name: 'MyComponent',
  data() {
    return {
      foo: 50,
      val: '我系value',
    }
  },
  // 组件接收名为title的props，并且该props的类型为string
  props: {
    title: '',
  },
  render() {
    return {
      type: 'h1',
      children: `foo 的值是: ${this.foo},父组件的props我拿到了: ${this.title}`,
    }
  },
  create() {
    console.log(this.foo)
  },
  beforeMount() {},
}

// vue 3.0 setup 组合式api
const SetupComponent = {
  props: {
    title: '',
  },
  setup(props, { emit }) {
    // console.log(props.title)
    // const { slot, emit, attrs, expose } = setupContext
    console.log(props, 'props')
    // emit('change', 1, 2, 3)
    const a = ref('张三')
    return {
      ...props,
      a,
    }
  },
  render() {
    return {
      type: 'div',
      children: [
        {
          type: 'h1',
          children: `我是h1,调用`,
        },
        {
          type: 'h2',
          children: `hello world div ${this.title}`,
          props: {
            onclick: () => {
              console.log('自增')
              this.title++
            },
          },
        },
      ],
      props: {},
    }
  },
}

const ComponentVNode = {
  type: SetupComponent,
  props: {
    title: '张三',
    onChange: (arg) => {
      alert(arg + ' 父组件调用')
    },
  },
}

// vue 3.0 slot 实现
const SlotComponent = {
  setup(props) {
    const a = reactive({
      hei: 'zhangsan',
    })
    // setTimeout(() => {
    //   a.hei = 'lisi'
    // }, 1000)

    // onMounted(() => {
    //   a.cv = 100
    //   console.log(a, 'a是啥')
    // })

    return {
      a,
    }
  },
  created() {
    // this.a.hei = '为啥不能改'
    // console.log(this.a.hei, '钩子')
  },
  beforeMount() {
    this.a.cv = 100
  },
  mounted() {
    // console.log(this.a.hei, 'lisi')
  },
  render() {
    return {
      type: 'div',
      children: [
        {
          type: 'div',
          children: [
            this.$slots.header(),
            {
              type: 'div',
              children: `获取到了 a ,${this.a?.hei},a.cv ${this.a?.cv} `,
            },
          ],
        },
        {
          type: 'div',
          children: [
            { type: 'h2', children: '我想说点啥' },
            this.$slots.body(),
          ],
          props: {
            onclick: () => {
              this.a.cv++
              console.log('this')
            },
          },
        },
        {
          type: 'slot',
        },
      ],
      props: {},
    }
  },
}

const SlotVnode = {
  type: SlotComponent,
  children: {
    header() {
      return {
        type: 'header',
        children: '我是header',
      }
    },
    body() {
      return {
        type: 'div',
        children: '我是body',
      }
    },
  },
}
renderer.render(SlotVnode, document.querySelector('#app'))

// setTimeout(() => {
//   console.time()
//   renderer.render(vnode2, document.querySelector('#app'))
//   console.timeEnd()
// }, 1000)
