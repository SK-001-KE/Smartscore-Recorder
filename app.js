// SmartScores Recorder - main app logic (responsive updates)
// NOTE: Modified to add data-label attributes for mobile table layout and mobile drawer toggle.
const STORAGE_KEY = 'smartscores_records_v1';

let records = [];
let editIndex = -1;
let chart = null;

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const form = document.getElementById('recordForm');
  const teacherInput = document.getElementById('teacher');
  const subjectInput = document.getElementById('subject');
  const gradeInput = document.getElementById('grade');
  const streamInput = document.getElementById('stream');
  const termInput = document.getElementById('term');
  const examInput = document.getElementById('examType');
  const yearInput = document.getElementById('year');
  const meanInput = document.getElementById('meanScore');
  const saveBtn = document.getElementById('saveBtn');
  const cancelEdit = document.getElementById('cancelEdit');

  const filterTeacher = document.getElementById('filterTeacher');
  const filterGrade = document.getElementById('filterGrade');
  const filterStream = document.getElementById('filterStream');
  const filterYear = document.getElementById('filterYear');
  const searchBox = document.getElementById('searchBox');
  const clearFilters = document.getElementById('clearFilters');

  const recordsTableBody = document.querySelector('#recordsTable tbody');
  const summaryDiv = document.getElementById('summary');
  const insightsDiv = document.getElementById('insightsContent');

  const btnExport = document.getElementById('btnExport');
  const btnImport = document.getElementById('btnImport');
  const importFile = document.getElementById('importFile');
  const btnPdf = document.getElementById('btnPdf');
  const btnReset = document.getElementById('btnReset');

  const menuToggle = document.getElementById('menuToggle');
  const leftPanel = document.getElementById('leftPanel');
  const overlay = document.getElementById('overlay');

  // load
  loadRecords();
  renderControls();
  renderAll();

  // Mobile drawer toggle
  function openDrawer() {
    leftPanel.classList.add('show');
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    leftPanel.classList.remove('show');
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
  }
  menuToggle.addEventListener('click', () => {
    if (leftPanel.classList.contains('show')) closeDrawer();
    else openDrawer();
  });
  overlay.addEventListener('click', () => closeDrawer());
  // Close drawer when resizing to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      closeDrawer();
    }
    if (chart) chart.resize();
  });

  // Form submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // Validation of numeric fields
    const year = parseInt(yearInput.value, 10);
    const mean = parseFloat(meanInput.value);
    if (isNaN(year) || year < 1900 || year > 2100) return alert('Please enter a valid year.');
    if (isNaN(mean) || mean < 0 || mean > 100) return alert('Mean score must be between 0 and 100.');

    const rec = {
      teacher: teacherInput.value.trim(),
      subject: subjectInput.value.trim(),
      grade: gradeInput.value.trim(),
      stream: streamInput.value.trim(),
      term: String(termInput.value),
      examType: examInput.value,
      year: String(year),
      meanScore: Number(mean.toFixed(2)),
      createdAt: new Date().toISOString()
    };

    // Duplicate check: same teacher, subject, grade, stream, term, examType, year
    const dupIndex = records.findIndex(r =>
      r.teacher.toLowerCase() === rec.teacher.toLowerCase() &&
      r.subject.toLowerCase() === rec.subject.toLowerCase() &&
      r.grade.toLowerCase() === rec.grade.toLowerCase() &&
      r.stream.toLowerCase() === rec.stream.toLowerCase() &&
      r.term === rec.term &&
      r.examType === rec.examType &&
      r.year === rec.year
    );

    if (editIndex > -1) {
      // updating existing
      records[editIndex] = rec;
      editIndex = -1;
      cancelEdit.style.display = 'none';
      document.getElementById('formTitle').innerText = 'Add Record';
    } else if (dupIndex > -1) {
      if (!confirm('A record with these keys already exists. Overwrite?')) return;
      records[dupIndex] = rec;
    } else {
      records.push(rec);
    }

    saveRecords();
    form.reset();
    renderControls();
    renderAll();
    // Close drawer on mobile after saving
    if (window.innerWidth <= 900) closeDrawer();
  });

  cancelEdit.addEventListener('click', () => {
    editIndex = -1;
    cancelEdit.style.display = 'none';
    document.getElementById('formTitle').innerText = 'Add Record';
    form.reset();
  });

  // Filters & search
  [filterTeacher, filterGrade, filterStream, filterYear].forEach(el => el.addEventListener('change', renderAll));
  searchBox.addEventListener('input', renderAll);
  clearFilters.addEventListener('click', () => {
    filterTeacher.value = '';
    filterGrade.value = '';
    filterStream.value = '';
    filterYear.value = '';
    searchBox.value = '';
    renderAll();
  });

  // Export/Import/Reset/PDF
  btnExport.addEventListener('click', () => {
    const dataStr = JSON.stringify(records, null, 2);
    const blob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartscores-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  btnImport.addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = JSON.parse(reader.result);
        if (!Array.isArray(incoming)) throw new Error('Invalid JSON format: expected array of records.');
        if (!confirm('Import will replace current records. Continue?')) return;
        records = incoming;
        saveRecords();
        renderControls();
        renderAll();
        alert('Import successful.');
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
    importFile.value = '';
  });

  btnReset.addEventListener('click', () => {
    if (!confirm('This will permanently delete all records. Are you sure?')) return;
    records = [];
    saveRecords();
    renderControls();
    renderAll();
  });

  btnPdf.addEventListener('click', () => {
    // Build a print-friendly container
    const container = document.createElement('div');
    container.style.padding = '16px';
    const title = document.createElement('h1');
    title.innerText = 'SmartScores Recorder - Report';
    container.appendChild(title);

    // Add records table snapshot
    const table = document.querySelector('#recordsTable').cloneNode(true);
    table.style.width = '100%';
    container.appendChild(table);

    // Add summary
    const sumNode = summaryDiv.cloneNode(true);
    container.appendChild(sumNode);

    // Add insights
    const insClone = insightsDiv.cloneNode(true);
    container.appendChild(insClone);

    // Use html2pdf
    const opt = {
      margin: 10,
      filename: `SmartScores_Report_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    };
    html2pdf().from(container).set(opt).save();
  });

  // Helper functions
  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      records = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Failed to load records', e);
      records = [];
    }
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  function renderControls() {
    // Populate filter selects from current records
    const teachers = uniqueSorted(records.map(r => r.teacher));
    const grades = uniqueSorted(records.map(r => r.grade));
    const streams = uniqueSorted(records.map(r => r.stream));
    const years = uniqueSorted(records.map(r => r.year));

    fillSelect(filterTeacher, teachers, 'All Teachers');
    fillSelect(filterGrade, grades, 'All Grades');
    fillSelect(filterStream, streams, 'All Streams');
    fillSelect(filterYear, years, 'All Years');
  }

  function fillSelect(selectEl, list, defaultText) {
    const cur = selectEl.value;
    selectEl.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = defaultText;
    selectEl.appendChild(opt);
    list.forEach(v => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      selectEl.appendChild(o);
    });
    // restore if available
    if ([...selectEl.options].some(o => o.value === cur)) selectEl.value = cur;
  }

  function uniqueSorted(arr) {
    return [...new Set(arr.filter(Boolean))].sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
  }

  function renderAll() {
    const filtered = applyFilters(records);
    renderTable(filtered);
    renderSummary(filtered);
    renderInsights(filtered);
    renderChart(filtered);
  }

  function applyFilters(arr) {
    const ft = filterTeacher.value.trim().toLowerCase();
    const fg = filterGrade.value.trim().toLowerCase();
    const fs = filterStream.value.trim().toLowerCase();
    const fy = filterYear.value.trim();
    const q = searchBox.value.trim().toLowerCase();

    return arr.filter(r => {
      if (ft && r.teacher.toLowerCase() !== ft) return false;
      if (fg && r.grade.toLowerCase() !== fg) return false;
      if (fs && r.stream.toLowerCase() !== fs) return false;
      if (fy && r.year !== fy) return false;
      if (q) {
        const hay = `${r.teacher} ${r.subject} ${r.grade} ${r.stream} ${r.examType} ${r.year} ${r.term} ${r.meanScore}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderTable(arr) {
    recordsTableBody.innerHTML = '';
    if (!arr.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 9;
      td.style.textAlign = 'center';
      td.textContent = 'No records';
      tr.appendChild(td);
      recordsTableBody.appendChild(tr);
      return;
    }

    arr.forEach((r, idx) => {
      const tr = document.createElement('tr');

      // Build cells with data-label attributes for responsive CSS
      const addCell = (label, contentHtml) => {
        const td = document.createElement('td');
        td.setAttribute('data-label', label);
        if (typeof contentHtml === 'string') td.innerHTML = contentHtml;
        else td.appendChild(contentHtml);
        return td;
      };

      tr.appendChild(addCell('Teacher', escapeHtml(r.teacher)));
      tr.appendChild(addCell('Subject', escapeHtml(r.subject)));
      tr.appendChild(addCell('Grade', escapeHtml(r.grade)));
      tr.appendChild(addCell('Stream', escapeHtml(r.stream)));
      tr.appendChild(addCell('Term', escapeHtml(r.term)));
      tr.appendChild(addCell('Exam', escapeHtml(r.examType)));
      tr.appendChild(addCell('Year', escapeHtml(r.year)));
      tr.appendChild(addCell('Mean', String(r.meanScore)));

      // Rubric cell: includes badge and action buttons
      const rubricCell = document.createElement('td');
      rubricCell.setAttribute('data-label', 'Rubric');
      rubricCell.className = 'rubric';
      // badge
      const badgeWrap = document.createElement('div');
      badgeWrap.innerHTML = rubricHtml(r.meanScore);
      rubricCell.appendChild(badgeWrap);

      // actions
      const actions = document.createElement('div');
      actions.className = 'record-actions';
      actions.style.marginLeft = '8px';
      const btnE = document.createElement('button');
      btnE.textContent = 'Edit';
      btnE.addEventListener('click', () => {
        // Find original index in records (not filtered arr). Match by unique keys
        const originalIndex = records.findIndex(orig =>
          orig.teacher === r.teacher && orig.subject === r.subject &&
          orig.grade === r.grade && orig.stream === r.stream &&
          orig.term === r.term && orig.examType === r.examType && orig.year === r.year && orig.meanScore === r.meanScore
        );
        if (originalIndex === -1) return alert('Record not found.');
        editIndex = originalIndex;
        document.getElementById('formTitle').innerText = 'Edit Record';
        cancelEdit.style.display = 'inline-block';
        // populate
        teacherInput.value = r.teacher;
        subjectInput.value = r.subject;
        gradeInput.value = r.grade;
        streamInput.value = r.stream;
        termInput.value = r.term;
        examInput.value = r.examType;
        yearInput.value = r.year;
        meanInput.value = r.meanScore;
        // open drawer on mobile so user sees the form
        if (window.innerWidth <= 900) openDrawer();
        window.scrollTo({top:0, behavior:'smooth'});
      });
      const btnD = document.createElement('button');
      btnD.textContent = 'Delete';
      btnD.className = 'del';
      btnD.addEventListener('click', () => {
        if (!confirm('Delete this record?')) return;
        const originalIndex = records.findIndex(orig =>
          orig.teacher === r.teacher && orig.subject === r.subject &&
          orig.grade === r.grade && orig.stream === r.stream &&
          orig.term === r.term && orig.examType === r.examType && orig.year === r.year && orig.meanScore === r.meanScore
        );
        if (originalIndex === -1) return alert('Record not found.');
        records.splice(originalIndex, 1);
        saveRecords();
        renderControls();
        renderAll();
      });
      actions.appendChild(btnE);
      actions.appendChild(btnD);
      rubricCell.appendChild(actions);

      tr.appendChild(rubricCell);
      recordsTableBody.appendChild(tr);
    });
  }

  function rubricHtml(score) {
    const grade = rubric(score);
    if (grade.key === 'exceed') {
      return `<span class="badge badge-exceed">🏅 Exceeding (${score})</span>`;
    } else if (grade.key === 'meet') {
      return `<span class="badge badge-meet">😊 Meeting (${score})</span>`;
    } else if (grade.key === 'approach') {
      return `<span class="badge badge-approach">🟡 Approaching (${score})</span>`;
    } else {
      return `<span class="badge badge-below">⚠️ Below (${score})</span>`;
    }
  }

  function rubric(score) {
    if (score >= 75) return {key:'exceed', color:'#16a34a', label:'Exceeding Expectations'};
    if (score >= 41) return {key:'meet', color:'#10b981', label:'Meeting Expectations'};
    if (score >= 21) return {key:'approach', color:'#f59e0b', label:'Approaching Expectations'};
    return {key:'below', color:'#dc2626', label:'Below Expectations'};
  }

  function renderSummary(arr) {
    // compute averages per term and overall
    const terms = ['1','2','3'];
    let overallTotal = 0, overallCount = 0;
    const termAverages = {};

    terms.forEach(t => {
      const group = arr.filter(r => r.term === t);
      const avg = group.length ? (group.reduce((s,x) => s + x.meanScore,0) / group.length) : 0;
      termAverages[t] = {avg: Number(avg.toFixed(2)), count: group.length};
      overallTotal += group.reduce((s,x) => s + x.meanScore, 0);
      overallCount += group.length;
    });
    const overallAvg = overallCount ? Number((overallTotal / overallCount).toFixed(2)) : 0;

    // Build HTML summary table
    const box = document.createElement('div');
    box.innerHTML = `
      <table class="summary-table">
        <thead><tr><th>Term</th><th>Average</th><th>Performance</th></tr></thead>
        <tbody>
          <tr><td>Term 1</td><td>${termAverages['1'].avg} (${termAverages['1'].count})</td><td>${perfSpan(termAverages['1'].avg)}</td></tr>
          <tr><td>Term 2</td><td>${termAverages['2'].avg} (${termAverages['2'].count})</td><td>${perfSpan(termAverages['2'].avg)}</td></tr>
          <tr><td>Term 3</td><td>${termAverages['3'].avg} (${termAverages['3'].count})</td><td>${perfSpan(termAverages['3'].avg)}</td></tr>
          <tr style="font-weight:700"><td>Overall</td><td>${overallAvg} (${overallCount})</td><td>${perfSpan(overallAvg)}</td></tr>
        </tbody>
      </table>
    `;
    summaryDiv.innerHTML = '';
    summaryDiv.appendChild(box);
  }

  function perfSpan(avg) {
    if (!avg && avg !== 0) return '';
    const r = rubric(avg);
    return `<span style="color:${r.color};font-weight:700">${emojiFor(r.key)} ${r.label}</span>`;
  }
  function emojiFor(key){
    if(key==='exceed') return '🏅';
    if(key==='meet') return '😊';
    if(key==='approach') return '🟡';
    return '⚠️';
  }

  function renderInsights(arr) {
    insightsDiv.innerHTML = '';
    if (!arr.length) {
      insightsDiv.innerText = 'No insights available.';
      return;
    }
    // Group by teacher + subject + grade + stream (to be specific)
    const map = {};
    arr.forEach(r => {
      const key = `${r.teacher}|||${r.subject}|||${r.grade}|||${r.stream}`;
      if (!map[key]) map[key] = {teacher:r.teacher, subject:r.subject, grade:r.grade, stream:r.stream, total:0, count:0};
      map[key].total += r.meanScore;
      map[key].count += 1;
    });
    const entries = Object.values(map);
    // sort by avg desc for stronger performance first
    entries.sort((a,b) => (b.total/b.count) - (a.total/a.count));
    entries.forEach(e => {
      const avg = Number((e.total / e.count).toFixed(2));
      const r = rubric(avg);
      const div = document.createElement('div');
      div.className = 'insight';
      div.style.borderLeft = `6px solid ${r.color}`;
      div.innerHTML = `${emojiFor(r.key)} <strong>${escapeHtml(e.teacher)}</strong> (${escapeHtml(e.subject)} - Grade ${escapeHtml(e.grade)}, ${escapeHtml(e.stream)}) is <span style="color:${r.color};font-weight:700">${r.label}</span> with an average of <strong>${avg}</strong>.`;
      insightsDiv.appendChild(div);
    });
  }

  function renderChart(arr) {
    // produce dataset: for each subject, compute average per term
    const subjects = uniqueSorted(arr.map(r => r.subject));
    const terms = ['1','2','3'];

    const labels = subjects;
    const datasets = terms.map((t, idx) => {
      const data = labels.map(s => {
        const group = arr.filter(r => r.subject === s && r.term === t);
        return group.length ? Number((group.reduce((s2,x) => s2 + x.meanScore,0) / group.length).toFixed(2)) : 0;
      });
      const colors = ['#2563eb', '#10b981', '#f59e0b'];
      return {
        label: `Term ${t}`,
        data,
        backgroundColor: colors[idx],
        borderColor: colors[idx],
        borderWidth: 1
      };
    });

    const ctx = document.getElementById('subjectChart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: { beginAtZero: true, max: 100 }
        }
      }
    });

    // ensure chart resizes after small delays (useful on mobile when drawer toggles)
    setTimeout(() => { if (chart) chart.resize(); }, 120);
  }

  // small helpers
  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }
});
