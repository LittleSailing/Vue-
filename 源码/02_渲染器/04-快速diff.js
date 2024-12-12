function patchKeyedChildren(n1, n2, container) {
  const newChildren = n1.children
  const oldChildren = n2.children

  // 预检 处理相同的前置节点
  let j = 0
  let newVNode = newChildren[j]
  let oldVNode = oldChildren[j]
  while (newVNode.key === oldVNode.key) {
    // 调用patch
    patch(oldVNode, newVNode, container)
    j++
    oldVNode = oldChildren[j]
    newVNode = newChildren[j]
  }

  // 更新相同的后置节点
  let oldEnd = oldChildren.length - 1
  let newEnd = newChildren.length - 1
  oldVNode = oldChildren[oldEnd]
  newVNode = newChildren[newEnd]

  //从尾部向前对比
  while (oldVNode.key === newVNode.key) {
    patch(oldVNode, newVNode, container)
    oldEnd--
    newEnd--
    oldVNode = oldChildren[oldEnd]
    newVNode = newChildren[newEnd]
  }
  // 预检添加 oldVNode 多余节点
  if (j > oldEnd && j <= newEnd) {
    const anchorIndex = newEnd + 1
    const anchor =
      anchorIndex < newChildren.length ? newChildren[anchorIndex].el : null
    while (j <= newEnd) {
      patch(null, newChildren[j++], container, anchor)
    }
  }
  // 预检删除 newVNode 多余节点
  else if (j > oldEnd && j <= newEnd) {
    while (j <= oldEnd) {
      unmount(oldChildren[j++])
    }
  } else {
    // 构造未处理的source数组
    // 新的一组子节点中剩余未处理的数量
    const count = newEnd - j + 1
    const source = new Array(count)
    source.fill(-1)
    const oldStart = j
    const newStart = j

    // 新增
    let moved = false
    let pos = 0

    // 构建索引表
    const keyIndex = {}
    for (let i = newStart; i <= newEnd; i++) {
      //    获取索引
      keyIndex[newChildren[i].key] = i
    }
    // 新增patched 变量，代表更新过的节点数量
    let patched = 0
    //遍历旧表剩余未处理的节点
    for (let i = oldStart; i <= oldEnd; i++) {
      oldVNode = oldChildren[i]
      //   如果更新过的节点数量小于需要更新的节点数量，则执行更新
      if (patched <= count) {
        // 通过索引表快速找到新的一组子节点具有相同 key 的位置
        const k = keyIndex[oldVNode.key]
        if (typeof k !== 'undefined') {
          newVNode = newChildren[k]
          // 调用patch更新
          patch(oldVNode, newChildren[k], container)
          patched++
          // 填充 source 数组
          source[k - newStart] = i
          // 判断是否需要移动
          if (k < pos) {
            moved = true
          } else {
            pos = k
          }
        } else {
          // 新的vnode没有当前key 卸载当前oldvnode
          unmount(oldVNode)
        }
      } else {
        unmount(oldVNode)
      }
    }
  }
}

// 最长递增子序列
function lis(arr) {
  let dp = new Array(arr.length).fill(1)
  for (let i = 1; i < arr.length; i++) {
    for (let j = 0; j < i; j++) {
      if (arr[i] > arr[j]) {
        dp[i] = Math.max(dp[i], dp[j] + 1)
      }
    }
  }

  let dzMap = {}
  // 获取下标递增
  for (let i = 0; i < dp.length; i++) {
    dzMap[dp[i]] = i
  }
  return Object.values(dzMap)
}
lis([1, 2, 3, 4, 5])
