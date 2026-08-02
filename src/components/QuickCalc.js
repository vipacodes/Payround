'use client';

import { useState } from 'react';
import { HiCalculator, HiX, HiBackspace } from 'react-icons/hi';

// Quick calculator — a standard keypad + proper % behaviour, available to ALL users
// from the calculator icon in the top bar.
//   200 × 10 % = 20        (percent of the running value)
//   100 + 10 % = 110       (add ten percent)
//   10 %       = 0.10      (plain percent on its own)

const tidy = (n) => {
  if (!Number.isFinite(n)) return 'Error';
  const r = Math.round(n * 1e10) / 1e10;
  return String(r);
};

export default function QuickCalc({ open, onClose }) {
  const [cur, setCur] = useState('0');   // what's on screen
  const [prev, setPrev] = useState(null);
  const [op, setOp] = useState(null);
  const [justEq, setJustEq] = useState(false);

  if (!open) return null;

  const inputDigit = (d) => {
    if (cur === 'Error' || justEq) { setCur(d === '.' ? '0.' : d); setJustEq(false); return; }
    if (d === '.' && cur.includes('.')) return;
    setCur(cur === '0' && d !== '.' ? d : cur + d);
  };

  const setOperator = (o) => {
    if (cur === 'Error') return;
    let base;
    if (op && prev !== null) {
      // chained op (2+3+…) — settle the running total first
      const a = prev, b = parseFloat(cur);
      base = op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : b === 0 ? NaN : a / b;
      if (!Number.isFinite(base)) { setCur('Error'); setPrev(null); setOp(null); setJustEq(true); return; }
    } else {
      base = parseFloat(cur);
    }
    setCur(tidy(base));
    setPrev(base);
    setOp(o);
    setJustEq(true);
  };

  const percent = () => {
    if (cur === 'Error') return;
    const v = parseFloat(cur);
    // with a pending + − × ÷, % means "that percent of the first number"
    const out = op && prev !== null ? (prev * v) / 100 : v / 100;
    setCur(tidy(out));
    setJustEq(false);
  };

  const equals = () => {
    if (op === null || prev === null || cur === 'Error') return;
    const a = prev, b = parseFloat(cur);
    const r = op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : b === 0 ? NaN : a / b;
    setCur(tidy(r));
    setPrev(null);
    setOp(null);
    setJustEq(true);
  };

  const clearAll = () => { setCur('0'); setPrev(null); setOp(null); setJustEq(false); };
  const backspace = () => { if (cur === 'Error' || justEq) { setCur('0'); setJustEq(false); return; } setCur(cur.length > 1 ? cur.slice(0, -1) : '0'); };
  const negate = () => { if (cur !== '0' && cur !== 'Error') setCur(cur.startsWith('-') ? cur.slice(1) : '-' + cur); };

  const sub = op && prev !== null ? `${tidy(prev)} ${op}` : 'Standard & percentage calculator';

  const Btn = ({ label, onClick, variant = 'num', span = 1, aria }) => (
    <button
      onClick={onClick}
      aria-label={aria || label}
      className={`h-12 rounded-xl text-lg font-bold transition-all active:scale-95 ${span === 2 ? 'col-span-2' : ''} ${
        variant === 'op' ? 'bg-primary-600 text-white hover:bg-primary-700'
        : variant === 'fn' ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        : variant === 'eq' ? 'bg-emerald-600 text-white hover:bg-emerald-700'
        : 'bg-white border border-gray-200 text-gray-900 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Quick calculator">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xs bg-gray-50 rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="text-sm font-bold text-gray-900 flex items-center gap-2"><HiCalculator className="w-5 h-5 text-primary-600" /> Quick Calculator</p>
          <button onClick={onClose} aria-label="Close calculator" className="p-1.5 rounded-full hover:bg-gray-200 text-gray-500"><HiX className="w-5 h-5" /></button>
        </div>

        <div className="px-5 pt-3 pb-4">
          <p className="text-[11px] text-primary-600 font-semibold h-4 text-right">{sub}</p>
          <p className="text-right text-3xl font-bold text-gray-900 break-all min-h-[2.5rem] mb-3" aria-live="polite">{cur}</p>

          <div className="grid grid-cols-4 gap-2">
            <Btn label="C" onClick={clearAll} variant="fn" aria="Clear all" />
            <Btn label={<HiBackspace className="w-5 h-5 mx-auto" />} onClick={backspace} variant="fn" aria="Backspace" />
            <Btn label="%" onClick={percent} variant="fn" aria="Percent" />
            <Btn label="÷" onClick={() => setOperator('÷')} variant="op" />
            <Btn label="7" onClick={() => inputDigit('7')} />
            <Btn label="8" onClick={() => inputDigit('8')} />
            <Btn label="9" onClick={() => inputDigit('9')} />
            <Btn label="×" onClick={() => setOperator('×')} variant="op" />
            <Btn label="4" onClick={() => inputDigit('4')} />
            <Btn label="5" onClick={() => inputDigit('5')} />
            <Btn label="6" onClick={() => inputDigit('6')} />
            <Btn label="−" onClick={() => setOperator('−')} variant="op" />
            <Btn label="1" onClick={() => inputDigit('1')} />
            <Btn label="2" onClick={() => inputDigit('2')} />
            <Btn label="3" onClick={() => inputDigit('3')} />
            <Btn label="+" onClick={() => setOperator('+')} variant="op" />
            <Btn label="±" onClick={negate} variant="fn" aria="Plus-minus" />
            <Btn label="0" onClick={() => inputDigit('0')} />
            <Btn label="." onClick={() => inputDigit('.')} />
            <Btn label="=" onClick={equals} variant="eq" aria="Equals" />
          </div>

          <p className="text-[10px] text-gray-400 mt-3 text-center">200 × 10 % = 20 &nbsp;•&nbsp; 100 + 10 % = 110 &nbsp;•&nbsp; 10 % = 0.10</p>
        </div>
      </div>
    </div>
  );
}
