/**
 * LiquidGlass 的 backdrop: 'auto' 不会重绘表单控件和按钮里的文字，
 * 所以把 Dock 拖到情形卡片、筛选按钮、操作按钮上时，只有正文会被折射。
 * 这里补一层“控件文字”画布，让所有可见文字都进入玻璃的背面。
 *
 * 只补按钮/输入框里的文字；正文仍由 auto 绘制，避免重复描字。
 */
export function paintControlText(ctx: CanvasRenderingContext2D): void {
  if (typeof document === 'undefined') return;
  const root = document.querySelector('.app') ?? document.body;
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();

  while (node) {
    const parent = node.parentElement;
    const text = node.textContent || '';
    if (parent && text.trim()) {
      const control = parent.closest('button,input,textarea,select,option');
      // Dock自己的按钮文字不画进 Dock 的背面，否则会形成反馈叠字
      if (control && !control.closest('[data-liquid-glass], .dock')) {
        const style = getComputedStyle(parent);
        if (style.visibility !== 'hidden' && style.display !== 'none') {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0.5 && rect.height > 0.5) {
            ctx.save();
            ctx.fillStyle = style.color;
            ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            ctx.textBaseline = 'middle';
            ctx.fillText(text, rect.left, rect.top + rect.height / 2);
            ctx.restore();
          }
        }
      }
    }
    node = walker.nextNode();
  }

  // input / textarea 的 value 和 placeholder 不在文本节点里，单独补
  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input,textarea').forEach((el) => {
    if (el.closest('[data-liquid-glass], .dock')) return;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    const value = String(el.value || el.placeholder || '').trim();
    if (!value) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    ctx.save();
    ctx.fillStyle = el.value ? style.color : getComputedStyle(el, '::placeholder').color || style.color;
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.textBaseline = 'top';
    ctx.fillText(value, rect.left + paddingLeft, rect.top + paddingTop);
    ctx.restore();
  });
}
