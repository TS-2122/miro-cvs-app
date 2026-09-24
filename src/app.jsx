import './assets/style.css';
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

const COLORS = {
  header: '#1a3c6e',
  headerText: '#FFFFFF',
  border: '#E3E6EA',
  rowA: '#FFFFFF',
  rowB: '#F7F8FA',
  ink: '#1A1A1A',
  inkSoft: '#6B7280',
  inkMuted: '#9CA3AF',
  warn: '#B54708',
  ok: '#067647',
  accent: '#1a3c6e',
};

const round = (n) => Math.round(n * 100) / 100;
const emptyNeed = () => ({ name: '', value: '', curPerf: 0, futPerf: 0 });
const REGISTRY_KEY = 'cvsMaps';
const MODE_LABEL = { current: 'Current', future: 'Future', comparison: 'Comparison' };

const GAP_RED_BG = '#FDECEA';
const GAP_GREEN_BG = '#E6F4EA';
const gapFill = (gap, value, defaultFill, isFuture, curGap) => {
  if (isFuture && curGap !== undefined && curGap !== null && gap < curGap) return GAP_GREEN_BG;
  if (gap >= 10 || gap >= value * 0.5) return GAP_RED_BG;
  return defaultFill;
};

const App = () => {
  const [outputMode, setOutputMode] = useState('comparison');
  const [customer, setCustomer] = useState('');
  const [process, setProcess] = useState('');
  const [needs, setNeeds] = useState([emptyNeed(), emptyNeed(), emptyNeed(), emptyNeed()]);
  const [status, setStatus] = useState('idle');
  const [editingFrameId, setEditingFrameId] = useState(null);

  useEffect(() => {
    const handler = async (event) => {
      const items = event.items || [];
      const frame = items.find((i) => i.type === 'frame');
      if (!frame) return;
      const registry = (await miro.board.getAppData(REGISTRY_KEY)) || [];
      const entry = registry.find((r) => r.frameId === frame.id);
      if (entry) {
        setEditingFrameId(frame.id);
        setOutputMode(entry.mode || 'comparison');
        setCustomer(entry.customer);
        setProcess(entry.process);
        setNeeds(entry.needs.map((n) => ({ ...n, value: n.value === 0 ? '' : n.value })));
      }
    };
    miro.board.ui.on('selection:update', handler);
    return () => miro.board.ui.off('selection:update', handler);
  }, []);

  const updateNeed = (i, field, val) => {
    const next = [...needs];
    if (field === 'name') {
      next[i] = { ...next[i], name: val };
    } else if (field === 'value') {
      if (val === '') {
        next[i] = { ...next[i], value: '' };
      } else {
        const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
        next[i] = { ...next[i], value: num };
      }
    } else {
      next[i] = { ...next[i], [field]: parseFloat(val) };
    }
    setNeeds(next);
  };

  const removeNeed = (i) => setNeeds(needs.filter((_, idx) => idx !== i));
  const addNeed = () => setNeeds([...needs, emptyNeed()]);

  const resetForm = () => {
    setEditingFrameId(null);
    setCustomer('');
    setProcess('');
    setNeeds([emptyNeed(), emptyNeed(), emptyNeed(), emptyNeed()]);
  };

  const total = round(needs.reduce((s, n) => s + (Number(n.value) || 0), 0));
  const totalOk = total === 100;

  const labelH = 28;
  const rowH = 34;
  const singleColWidths = [230, 65, 90, 70, 70];
  const singleHeaderH = 34;
  const singleTableW = singleColWidths.reduce((a, b) => a + b, 0);

  const cmpColWidths = [200, 65, 60, 95, 70, 70]; // Name, Value, Type, Performance, Score, Gap
  const cmpHeaderH = 34;
  const cmpTableW = cmpColWidths.reduce((a, b) => a + b, 0);

  const getTableW = (mode) => (mode === 'comparison' ? cmpTableW : singleTableW);
  const getTableH = (mode, count) => {
    if (mode === 'comparison') return labelH * 2 + cmpHeaderH + count * rowH * 2;
    return labelH * 2 + singleHeaderH + count * rowH;
  };

  const addCellFactory = (frame, originX, originY) => async (text, x, y, w, h, opts = {}) => {
    const align = opts.align || 'left';
    const padded = align === 'left' ? `&nbsp;&nbsp;&nbsp;&nbsp;${text}` : align === 'right' ? `${text}&nbsp;&nbsp;&nbsp;&nbsp;` : `&nbsp;&nbsp;${text}&nbsp;&nbsp;`;
    const shape = await miro.board.createShape({
      shape: 'rectangle',
      content: padded,
      x: originX + x + w / 2,
      y: originY + y + h / 2,
      width: w,
      height: h,
      style: {
        fillColor: opts.fill || COLORS.rowA,
        borderColor: COLORS.border,
        borderWidth: 1,
        color: opts.textColor || COLORS.ink,
        fontSize: opts.fontSize || 12,
        textAlign: align,
        textAlignVertical: 'middle',
      },
    });
    await frame.add(shape);
    return shape;
  };

  const drawTable = async (frame, originX, originY, validNeeds, custVal, procVal, mode) => {
    const addCell = addCellFactory(frame, originX, originY);
    const tableW = getTableW(mode);

    let y = 0;
    await addCell(`Customer:  ${custVal || '—'}`, 0, y, tableW, labelH, { fill: COLORS.rowB, align: 'left' });
    y += labelH;
    await addCell(`Process:  ${procVal || '—'}`, 0, y, tableW, labelH, { fill: COLORS.rowB, align: 'left' });
    y += labelH;

    if (mode !== 'comparison') {
      const key = mode === 'current' ? 'curPerf' : 'futPerf';
      let x = 0;
      const headers = ['Customer needs', 'Value', 'Performance', 'Score', 'Gap'];
      for (let c = 0; c < headers.length; c++) {
        await addCell(headers[c], x, y, singleColWidths[c], singleHeaderH, {
          fill: COLORS.header, textColor: COLORS.headerText, fontSize: 12, align: 'center',
        });
        x += singleColWidths[c];
      }
      y += singleHeaderH;

      for (let idx = 0; idx < validNeeds.length; idx++) {
        const n = validNeeds[idx];
        const v = Number(n.value) || 0;
        const perf = n[key];
        const score = round(v * perf);
        const gap = round(v - score);
        const rowFill = idx % 2 === 0 ? COLORS.rowA : COLORS.rowB;
        const curGapForCompare = mode === 'future' ? round(v - round(v * n.curPerf)) : null;
        const gapCellFill = gapFill(gap, v, rowFill, mode === 'future', curGapForCompare);

        x = 0;
        await addCell(n.name, x, y, singleColWidths[0], rowH, { fill: rowFill, align: 'left' });
        x += singleColWidths[0];
        await addCell(String(v), x, y, singleColWidths[1], rowH, { fill: rowFill, align: 'center' });
        x += singleColWidths[1];
        await addCell(perf.toFixed(1), x, y, singleColWidths[2], rowH, { fill: rowFill, align: 'center' });
        x += singleColWidths[2];
        await addCell(String(score), x, y, singleColWidths[3], rowH, { fill: rowFill, align: 'center' });
        x += singleColWidths[3];
        await addCell(String(gap), x, y, singleColWidths[4], rowH, { fill: gapCellFill, align: 'center' });
        y += rowH;
      }
      return;
    }

    // comparison mode - mirrors the Excel layout: Current/Future as paired rows per need
    let x = 0;
    const headers = ['Customer needs', 'Value', 'Type', 'Performance', 'Score', 'Gap'];
    for (let c = 0; c < headers.length; c++) {
      await addCell(headers[c], x, y, cmpColWidths[c], cmpHeaderH, {
        fill: COLORS.header, textColor: COLORS.headerText, fontSize: 12, align: 'center',
      });
      x += cmpColWidths[c];
    }
    y += cmpHeaderH;

    for (let idx = 0; idx < validNeeds.length; idx++) {
      const n = validNeeds[idx];
      const v = Number(n.value) || 0;
      const curScore = round(v * n.curPerf);
      const curGap = round(v - curScore);
      const futScore = round(v * n.futPerf);
      const futGap = round(v - futScore);
      const rowFill = idx % 2 === 0 ? COLORS.rowA : COLORS.rowB;
      const blockH = rowH * 2;
      const curGapFill = gapFill(curGap, v, rowFill, false);
      const futGapFill = gapFill(futGap, v, rowFill, true, curGap);

      let cx = 0;
      await addCell(n.name, cx, y, cmpColWidths[0], blockH, { fill: rowFill, align: 'left' });
      cx += cmpColWidths[0];
      await addCell(String(v), cx, y, cmpColWidths[1], blockH, { fill: rowFill, align: 'center' });
      cx += cmpColWidths[1];

      let cxCur = cx;
      await addCell('Current', cxCur, y, cmpColWidths[2], rowH, { fill: rowFill, align: 'center' });
      cxCur += cmpColWidths[2];
      await addCell(n.curPerf.toFixed(1), cxCur, y, cmpColWidths[3], rowH, { fill: rowFill, align: 'center' });
      cxCur += cmpColWidths[3];
      await addCell(String(curScore), cxCur, y, cmpColWidths[4], rowH, { fill: rowFill, align: 'center' });
      cxCur += cmpColWidths[4];
      await addCell(String(curGap), cxCur, y, cmpColWidths[5], rowH, { fill: curGapFill, align: 'center' });

      let cxFut = cx;
      const futY = y + rowH;
      await addCell('Future', cxFut, futY, cmpColWidths[2], rowH, { fill: rowFill, align: 'center' });
      cxFut += cmpColWidths[2];
      await addCell(n.futPerf.toFixed(1), cxFut, futY, cmpColWidths[3], rowH, { fill: rowFill, align: 'center' });
      cxFut += cmpColWidths[3];
      await addCell(String(futScore), cxFut, futY, cmpColWidths[4], rowH, { fill: rowFill, align: 'center' });
      cxFut += cmpColWidths[4];
      await addCell(String(futGap), cxFut, futY, cmpColWidths[5], rowH, { fill: futGapFill, align: 'center' });

      y += blockH;
    }
  };

  const handleAddToBoard = async () => {
    setStatus('saving');

    const validNeeds = needs.filter((n) => n.name && n.name.trim() !== '');
    const tableW = getTableW(outputMode);
    const tableH = getTableH(outputMode, validNeeds.length);
    const modeLabel = MODE_LABEL[outputMode];
    const registry = (await miro.board.getAppData(REGISTRY_KEY)) || [];

    if (editingFrameId) {
      const frame = await miro.board.getById(editingFrameId);
      const children = frame.childrenIds && frame.childrenIds.length
        ? await miro.board.get({ id: frame.childrenIds })
        : [];
      for (const child of children) {
        await miro.board.remove(child);
      }
      frame.title = `CVS (${modeLabel}): ${customer || 'Customer'} / ${process || 'Process'}`;
      frame.width = tableW + 40;
      frame.height = tableH + 40;
      await frame.sync();

      const originX = frame.x - frame.width / 2 + 20;
      const originY = frame.y - frame.height / 2 + 20;
      await drawTable(frame, originX, originY, validNeeds, customer, process, outputMode);

      const idx = registry.findIndex((r) => r.frameId === editingFrameId);
      const entry = { frameId: editingFrameId, customer, process, mode: outputMode, needs: validNeeds };
      if (idx >= 0) registry[idx] = entry; else registry.push(entry);
      await miro.board.setAppData(REGISTRY_KEY, registry);

      await miro.board.viewport.zoomTo(frame);
      resetForm();
      setStatus('done');
      setTimeout(() => setStatus('idle'), 2000);
      return;
    }

    const spot = await miro.board.findEmptySpace({
      x: 0, y: 0, width: tableW + 40, height: tableH + 40, offset: 60,
    });

    const frame = await miro.board.createFrame({
      title: `CVS (${modeLabel}): ${customer || 'Customer'} / ${process || 'Process'}`,
      x: spot.x, y: spot.y, width: tableW + 40, height: tableH + 40,
    });

    const originX = spot.x - (tableW + 40) / 2 + 20;
    const originY = spot.y - (tableH + 40) / 2 + 20;
    await drawTable(frame, originX, originY, validNeeds, customer, process, outputMode);

    registry.push({ frameId: frame.id, customer, process, mode: outputMode, needs: validNeeds });
    await miro.board.setAppData(REGISTRY_KEY, registry);

    await miro.board.viewport.zoomTo(frame);
    resetForm();
    setStatus('done');
    setTimeout(() => setStatus('idle'), 2000);
  };

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif', fontSize: 13, color: COLORS.ink, boxSizing: 'border-box' }}>
      <style>{`* { box-sizing: border-box; }`}</style>
      {editingFrameId && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: COLORS.rowB, borderRadius: 6, padding: '6px 10px', marginBottom: 12, fontSize: 12,
        }}>
          <span style={{ color: COLORS.inkSoft }}>Editing a map on the board</span>
          <button onClick={resetForm} style={{ border: 'none', background: 'none', color: COLORS.accent, cursor: 'pointer', fontWeight: 500 }}>
            + New map
          </button>
        </div>
      )}

      <input
        placeholder="Customer (e.g. Drive thru patron)"
        value={customer}
        onChange={(e) => setCustomer(e.target.value)}
        style={{ width: '100%', marginBottom: 6, padding: 7, border: `1px solid ${COLORS.border}`, borderRadius: 6 }}
      />
      <input
        placeholder="Process (e.g. Placing an order)"
        value={process}
        onChange={(e) => setProcess(e.target.value)}
        style={{ width: '100%', marginBottom: 18, padding: 7, border: `1px solid ${COLORS.border}`, borderRadius: 6 }}
      />

      {needs.map((n, i) => (
        <div key={i} style={{ borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              placeholder="Customer need"
              value={n.name}
              onChange={(e) => updateNeed(i, 'name', e.target.value)}
              style={{ flex: 1, padding: 6, border: `1px solid ${COLORS.border}`, borderRadius: 6 }}
            />
            <input
              type="number" min="0" max="100" placeholder="Val"
              value={n.value}
              onChange={(e) => updateNeed(i, 'value', e.target.value)}
              style={{ width: 52, padding: 6, border: `1px solid ${COLORS.border}`, borderRadius: 6, textAlign: 'center' }}
            />
            <button
              onClick={() => removeNeed(i)}
              style={{ width: 24, height: 24, padding: 0, border: 'none', background: 'none', color: COLORS.inkMuted, cursor: 'pointer', flexShrink: 0 }}
              aria-label="Remove need"
            >×</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: COLORS.inkMuted, width: 44 }}>Current</span>
            <input
              type="range" min="0" max="1" step="0.5"
              value={n.curPerf}
              onChange={(e) => updateNeed(i, 'curPerf', e.target.value)}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, color: COLORS.inkSoft, width: 24, textAlign: 'right' }}>{n.curPerf.toFixed(1)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: COLORS.inkMuted, width: 44 }}>Future</span>
            <input
              type="range" min="0" max="1" step="0.5"
              value={n.futPerf}
              onChange={(e) => updateNeed(i, 'futPerf', e.target.value)}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 12, color: COLORS.inkSoft, width: 24, textAlign: 'right' }}>{n.futPerf.toFixed(1)}</span>
          </div>
        </div>
      ))}

      <button
        onClick={addNeed}
        style={{ marginBottom: 18, padding: '6px 12px', border: `1px solid ${COLORS.border}`, borderRadius: 6, background: '#fff', cursor: 'pointer' }}
      >+ Add need</button>

      <div style={{ color: totalOk ? COLORS.ok : COLORS.warn, marginBottom: 16, fontSize: 13 }}>
        Total value: {total}{totalOk ? ' ✓' : ' (needs to equal 100)'}
      </div>

      <div style={{ fontSize: 11, color: COLORS.inkMuted, marginBottom: 6 }}>Board output</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['current', 'future', 'comparison'].map((m) => (
          <button
            key={m}
            onClick={() => setOutputMode(m)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 12,
              border: `1px solid ${COLORS.accent}`,
              background: outputMode === m ? COLORS.accent : '#fff',
              color: outputMode === m ? '#fff' : COLORS.accent,
              fontWeight: 500, cursor: 'pointer',
            }}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <button
        onClick={handleAddToBoard}
        disabled={status === 'saving' || !totalOk}
        style={{
          background: COLORS.accent, color: '#fff', border: 'none', borderRadius: 6,
          padding: '10px 18px', fontWeight: 500, width: '100%',
          cursor: totalOk ? 'pointer' : 'not-allowed', opacity: totalOk ? 1 : 0.5,
        }}
      >
        {status === 'saving'
          ? 'Saving...'
          : status === 'done'
          ? 'Saved ✓'
          : editingFrameId
          ? 'Update board'
          : `Add ${MODE_LABEL[outputMode].toLowerCase()} map to board`}
      </button>
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);

export default App;