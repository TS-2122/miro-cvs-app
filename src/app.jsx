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
const emptyNeed = () => ({ name: '', value: '', perf: 0 });
const REGISTRY_KEY = 'cvsMaps';

const App = () => {
  const [phase, setPhase] = useState('current');
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
        setPhase(entry.phase);
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
      next[i] = { ...next[i], perf: parseFloat(val) };
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

  const colWidths = [230, 65, 90, 70, 70];
  const rowH = 34;
  const labelH = 28;
  const headerH = 34;
  const tableW = colWidths.reduce((a, b) => a + b, 0);

  const drawTable = async (frame, originX, originY, validNeeds, custVal, procVal) => {
    const addCell = async (text, x, y, w, h, opts = {}) => {
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

    let y = 0;
    await addCell(`Customer:  ${custVal || '—'}`, 0, y, tableW, labelH, { fill: COLORS.rowB, align: 'left' });
    y += labelH;
    await addCell(`Process:  ${procVal || '—'}`, 0, y, tableW, labelH, { fill: COLORS.rowB, align: 'left' });
    y += labelH;

    let x = 0;
    const headers = ['Customer needs', 'Value', 'Performance', 'Score', 'Gap'];
    for (let c = 0; c < headers.length; c++) {
      await addCell(headers[c], x, y, colWidths[c], headerH, {
        fill: COLORS.header, textColor: COLORS.headerText, fontSize: 12, align: 'center',
      });
      x += colWidths[c];
    }
    y += headerH;

    for (let idx = 0; idx < validNeeds.length; idx++) {
      const n = validNeeds[idx];
      const v = Number(n.value) || 0;
      const score = round(v * n.perf);
      const gap = round(v - score);
      const rowFill = idx % 2 === 0 ? COLORS.rowA : COLORS.rowB;

      x = 0;
      await addCell(n.name, x, y, colWidths[0], rowH, { fill: rowFill, align: 'left' });
      x += colWidths[0];
      await addCell(String(v), x, y, colWidths[1], rowH, { fill: rowFill, align: 'center' });
      x += colWidths[1];
      await addCell(n.perf.toFixed(1), x, y, colWidths[2], rowH, { fill: rowFill, align: 'center' });
      x += colWidths[2];
      await addCell(String(score), x, y, colWidths[3], rowH, { fill: rowFill, align: 'center' });
      x += colWidths[3];
      await addCell(String(gap), x, y, colWidths[4], rowH, { fill: rowFill, align: 'center' });
      y += rowH;
    }
  };

  const handleAddToBoard = async () => {
    setStatus('saving');

    const validNeeds = needs.filter((n) => n.name && n.name.trim() !== '');
    const tableH = labelH * 2 + headerH + validNeeds.length * rowH;
    const phaseLabel = phase === 'current' ? 'Current' : 'Future';
    const registry = (await miro.board.getAppData(REGISTRY_KEY)) || [];

    if (editingFrameId) {
      const frame = await miro.board.getById(editingFrameId);
      const children = frame.childrenIds && frame.childrenIds.length
        ? await miro.board.get({ id: frame.childrenIds })
        : [];
      for (const child of children) {
        await miro.board.remove(child);
      }
      frame.title = `CVS (${phaseLabel}): ${customer || 'Customer'} / ${process || 'Process'}`;
      frame.width = tableW + 40;
      frame.height = tableH + 40;
      await frame.sync();

      const originX = frame.x - frame.width / 2 + 20;
      const originY = frame.y - frame.height / 2 + 20;
      await drawTable(frame, originX, originY, validNeeds, customer, process);

      const idx = registry.findIndex((r) => r.frameId === editingFrameId);
      const entry = { frameId: editingFrameId, customer, process, phase, needs: validNeeds };
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
      title: `CVS (${phaseLabel}): ${customer || 'Customer'} / ${process || 'Process'}`,
      x: spot.x, y: spot.y, width: tableW + 40, height: tableH + 40,
    });

    const originX = spot.x - (tableW + 40) / 2 + 20;
    const originY = spot.y - (tableH + 40) / 2 + 20;
    await drawTable(frame, originX, originY, validNeeds, customer, process);

    registry.push({ frameId: frame.id, customer, process, phase, needs: validNeeds });
    await miro.board.setAppData(REGISTRY_KEY, registry);

    await miro.board.viewport.zoomTo(frame);
    resetForm();
    setStatus('done');
    setTimeout(() => setStatus('idle'), 2000);
  };

  const colHeaderStyle = { fontSize: 11, color: COLORS.inkMuted, textAlign: 'center' };

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif', fontSize: 13, color: COLORS.ink }}>
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

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['current', 'future'].map((p) => (
          <button
            key={p}
            onClick={() => setPhase(p)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 6,
              border: `1px solid ${COLORS.accent}`,
              background: phase === p ? COLORS.accent : '#fff',
              color: phase === p ? '#fff' : COLORS.accent,
              fontWeight: 500, cursor: 'pointer',
            }}
          >
            {p === 'current' ? 'Current process' : 'Future process'}
          </button>
        ))}
      </div>

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

      <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr 34px 34px 22px', gap: 8, marginBottom: 6, paddingLeft: 2 }}>
        <div style={colHeaderStyle}>Value</div>
        <div style={colHeaderStyle}>Performance</div>
        <div style={colHeaderStyle}>Score</div>
        <div style={colHeaderStyle}>Gap</div>
        <div />
      </div>

      {needs.map((n, i) => {
        const v = Number(n.value) || 0;
        const score = round(v * n.perf);
        const gap = round(v - score);
        return (
          <div key={i} style={{ borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 10, marginBottom: 10 }}>
            <input
              placeholder="Customer need"
              value={n.name}
              onChange={(e) => updateNeed(i, 'name', e.target.value)}
              style={{ width: '100%', marginBottom: 6, padding: 6, border: `1px solid ${COLORS.border}`, borderRadius: 6 }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr 34px 34px 22px', gap: 8, alignItems: 'center' }}>
              <input
                type="number" min="0" max="100" placeholder="0"
                value={n.value}
                onChange={(e) => updateNeed(i, 'value', e.target.value)}
                style={{ width: '100%', padding: 5, border: `1px solid ${COLORS.border}`, borderRadius: 6, textAlign: 'center' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="range" min="0" max="1" step="0.1"
                  value={n.perf}
                  onChange={(e) => updateNeed(i, 'perf', e.target.value)}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 12, color: COLORS.inkSoft, width: 24 }}>{n.perf.toFixed(1)}</span>
              </div>
              <div style={{ fontSize: 13, textAlign: 'center', color: COLORS.inkSoft }}>{score}</div>
              <div style={{ fontSize: 13, textAlign: 'center', color: COLORS.inkSoft }}>{gap}</div>
              <button
                onClick={() => removeNeed(i)}
                style={{ width: 22, height: 22, padding: 0, border: 'none', background: 'none', color: COLORS.inkMuted, cursor: 'pointer' }}
                aria-label="Remove need"
              >×</button>
            </div>
          </div>
        );
      })}

      <button
        onClick={addNeed}
        style={{ marginBottom: 16, padding: '6px 12px', border: `1px solid ${COLORS.border}`, borderRadius: 6, background: '#fff', cursor: 'pointer' }}
      >+ Add need</button>

      <div style={{ color: totalOk ? COLORS.ok : COLORS.warn, marginBottom: 12, fontSize: 13 }}>
        Total value: {total}{totalOk ? ' ✓' : ' (needs to equal 100)'}
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
          : `Add ${phase} map to board`}
      </button>
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);

export default App;