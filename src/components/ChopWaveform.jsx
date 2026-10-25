import React, { useEffect, useRef, useState } from 'react';
import { CHOP_COUNT } from '../audio/chops.js';

// Pointer-captured boundary dragging lets the user edit slice points without modifying the source file.
export default function ChopWaveform({ peaks, markers, selected, onSelect, onMove }) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#14121d';
    ctx.fillRect(0, 0, w, h);
    const x0 = markers[selected] * w;
    const x1 = markers[selected + 1] * w;
    ctx.fillStyle = '#68445d';
    ctx.fillRect(x0, 0, x1 - x0, h);
    for (let i = 0; i < CHOP_COUNT; i++) {
      const start = markers[i] * w;
      ctx.fillStyle = i % 2 ? '#ffffff06' : '#ffffff0b';
      ctx.fillRect(start, 0, (markers[i + 1] - markers[i]) * w, h);
    }
    if (peaks?.length) {
      const center = h / 2;
      for (let x = 0; x < peaks.length; x++) {
        const p = peaks[x], left = x / peaks.length * w;
        ctx.strokeStyle = (left >= x0 && left <= x1) ? '#ffcd93' : '#b789e8';
        ctx.lineWidth = Math.max(1, w / peaks.length);
        ctx.beginPath();
        ctx.moveTo(left, center - p.max * (h * 0.42));
        ctx.lineTo(left, center - p.min * (h * 0.42));
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#b09dab';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LOAD A BREAK TO VIEW ITS WAVEFORM', w / 2, h / 2);
    }
    ctx.textAlign = 'left';
    for (let i = 0; i <= CHOP_COUNT; i++) {
      const x = markers[i] * w;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h);
      ctx.strokeStyle = i === selected || i === selected + 1 ? '#ffd394' : '#927ca0';
      ctx.lineWidth = i === selected || i === selected + 1 ? 2.3 : 1;
      ctx.stroke();
      if (i < CHOP_COUNT) {
        ctx.fillStyle = i === selected ? '#ffdbad' : '#ad9dac';
        ctx.font = '11px monospace';
        ctx.fillText(String(i + 1).padStart(2, '0'), x + 5, 15);
      }
    }
    ctx.fillStyle = '#ffffff18'; ctx.fillRect(0, h / 2, w, 1);
  }, [peaks, markers, selected]);

  const point = event => {
    const bounds = canvasRef.current.getBoundingClientRect();
    return { fraction: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), width: bounds.width };
  };
  const onDown = event => {
    if (!peaks?.length) return;
    const { fraction, width } = point(event);
    let nearest = -1, distance = Infinity;
    for (let i = 1; i < CHOP_COUNT; i++) {
      const d = Math.abs(markers[i] - fraction) * width;
      if (d < distance) { nearest = i; distance = d; }
    }
    if (distance < 11) {
      dragRef.current = nearest;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    } else {
      const index = markers.findIndex((value, i) => i < CHOP_COUNT && fraction >= value && fraction < markers[i + 1]);
      onSelect(index < 0 ? CHOP_COUNT - 1 : index);
    }
  };
  const onMovePointer = event => {
    if (dragRef.current === null) return;
    onMove(dragRef.current, point(event).fraction);
  };
  const onUp = event => {
    if (dragRef.current !== null) {
      dragRef.current = null; setDragging(false);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  return (
    <div className="chop-waveform">
      <canvas ref={canvasRef} width={960} height={165} role="img"
        aria-label="Waveform with sixteen draggable slice boundaries"
        className={'chop-wave-canvas ' + (dragging ? 'is-dragging' : '')}
        onPointerDown={onDown} onPointerMove={onMovePointer} onPointerUp={onUp} onPointerCancel={onUp} />
      <div className="chop-slice-grid" role="group" aria-label="Choose a slice to preview">
        {Array.from({ length: CHOP_COUNT }, (_, i) => (
          <button type="button" key={i} className={selected === i ? 'active' : ''}
            aria-pressed={selected === i} onClick={() => onSelect(i)}
            aria-label={'Select slice ' + (i + 1)}>
            {String(i + 1).padStart(2, '0')}
          </button>
        ))}
      </div>
    </div>
  );
}
