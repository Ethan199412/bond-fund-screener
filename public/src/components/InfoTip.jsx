import { useEffect, useRef, useState } from 'react';

// 表头「?」说明气泡：点击展开，点击外部关闭
export default function InfoTip({ text }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <span className="infotip" ref={ref}>
      <button
        className="infotip-btn"
        aria-label="指标说明"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        ?
      </button>
      {open && <span className="infotip-pop">{text}</span>}
    </span>
  );
}
