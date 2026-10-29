/**
 * 上下边缘的渐进模糊层。
 *
 * 参考网易云 REA 的滚动边缘：内容进入顶部/底部时逐渐被模糊，
 * 中间区域保持清晰；模糊层只做视觉，不拦截鼠标。
 */
export function EdgeBlur() {
  return (
    <>
      <div className="edge-blur edge-blur-top" aria-hidden="true" />
      <div className="edge-blur edge-blur-bottom" aria-hidden="true" />
    </>
  );
}
