// SmartScores Recorder - main app logic
// Summary updated: average per teacher+subject+grade+stream+term+year calculated from cumulative exams entered for that term.
// PDF and HTML summary use the same grouped logic (averages are computed from available exam records only).

const { jsPDF } = window.jspdf;
const STORAGE_KEY = 'smartscores_records_v1';
const KEEP_TEACHER_KEY = 'smartscores_keep_teacher';

let records = [];
let editIndex = -1;

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
  const keepTeacher = document.getElementById('keepTeacher');

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

  // restore keepTeacher state from localStorage (default: true)
  const storedKeep = localStorage.getItem(KEEP_TEACHER_KEY);
  if (storedKeep === null) {
    keepTeacher.checked = true;
    localStorage.setItem(KEEP_TEACHER_KEY, 'true');
  } else {
    keepTeacher.checked = storedKeep === 'true';
  }
  keepTeacher.addEventListener('change', () => {
    localStorage.setItem(KEEP_TEACHER_KEY, keepTeacher.checked ? 'true' : 'false');
  });

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
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      if (leftPanel.classList.contains('show')) closeDrawer();
      else openDrawer();
    });
  }
  if (overlay) overlay.addEventListener('click', () => closeDrawer());

  // Close drawer when resizing to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) {
      closeDrawer();
    }
  });

  // Form submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    // Basic required validation for selects and text input
    const teacher = teacherInput.value.trim();
    if (!teacher) return alert('Please enter the teacher name.');

    if (!subjectInput.value) return alert('Please select a subject.');
    if (!gradeInput.value) return alert('Please select a grade.');
    if (!streamInput.value) return alert('Please select a stream.');
    if (!termInput.value) return alert('Please select a term.');
    if (!examInput.value) return alert('Please select an exam type.');

    // Validation of numeric fields
    const year = parseInt(yearInput.value, 10);
    const mean = parseFloat(meanInput.value);
    if (isNaN(year) || year < 1900 || year > 2100) return alert('Please enter a valid year between 1900 and 2100.');
    if (isNaN(mean) || mean < 0 || mean > 100) return alert('Mean score must be a number between 0 and 100.');

    const rec = {
      teacher,
      subject: subjectInput.value,
      grade: gradeInput.value,
      stream: streamInput.value,
      term: String(termInput.value),
      examType: examInput.value,
      year: String(year),
      meanScore: Number(mean.toFixed(2)),
      createdAt: new Date().toISOString()
    };

    // Duplicate check: same teacher, subject, grade, stream, term, examType, year
    const dupIndex = records.findIndex(r =>
      r.teacher.toLowerCase() === rec.teacher.toLowerCase() &&
      r.subject === rec.subject &&
      r.grade === rec.grade &&
      r.stream === rec.stream &&
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

    // Reset the form but optionally keep teacher (based on checkbox)
    const savedTeacher = rec.teacher;
    form.reset();
    if (keepTeacher.checked) {
      teacherInput.value = savedTeacher;
    } else {
      teacherInput.value = '';
    }
    // ensure other selects cleared
    subjectInput.value = '';
    gradeInput.value = '';
    streamInput.value = '';
    termInput.value = '';
    examInput.value = '';

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
    // keep or clear teacher depending on checkbox
    if (!keepTeacher.checked) teacherInput.value = '';
    // ensure selects cleared
    subjectInput.value = '';
    gradeInput.value = '';
    streamInput.value = '';
    termInput.value = '';
    examInput.value = '';
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

  // Export/Import/Reset
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

  // PDF: using jsPDF + autoTable to produce native text PDF (no buttons, not a screenshot)
  btnPdf.addEventListener('click', () => {
    const filtered = applyFilters(records);

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageWidth = doc.internal.pageSize.getWidth();
    let cursorY = 14;
    doc.setFontSize(16);
    doc.text('SmartScores Recorder - Report', pageWidth / 2, cursorY, { align: 'center' });

    doc.setFontSize(10);
    cursorY += 8;
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, cursorY);

    // Records table
    cursorY += 8;
    if (filtered.length) {
      const recordsHead = [['Teacher','Subject','Grade','Stream','Term','Exam Type','Year','Mean','Rubric']];
      const recordsBody = filtered.map(r => {
        const rub = rubric(r.meanScore);
        return [
          r.teacher,
          r.subject,
          r.grade,
          r.stream,
          r.term,
          r.examType,
          r.year,
          String(r.meanScore),
          `${emojiFor(rub.key)} ${rub.label}`
        ];
      });

      doc.autoTable({
        head: recordsHead,
        body: recordsBody,
        startY: cursorY,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [79,70,229], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 32 }, // teacher
          1: { cellWidth: 30 }, // subject
          2: { cellWidth: 10 }, // grade
          3: { cellWidth: 18 }, // stream
          4: { cellWidth: 10 }, // term
          5: { cellWidth: 24 }, // exam
          6: { cellWidth: 14 }, // year
          7: { cellWidth: 12 }, // mean
          8: { cellWidth: 28 }  // rubric
        }
      });

      cursorY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : cursorY + 8;
    } else {
      doc.text('No records to display.', 14, cursorY);
      cursorY += 10;
    }

    // Summary table (grouped per teacher+subject+grade+stream+term+year)
    const summaryEntries = buildSummaryEntries(filtered);
    if (summaryEntries.length) {
      const summaryHead = [['Teacher','Subject','Grade','Stream','Term','Year','Exams','Average','Rubric']];
      const summaryBody = summaryEntries.map(en => [
        en.teacher,
        en.subject,
        en.grade,
        en.stream,
        en.term,
        en.year,
        String(en.examsCount),
        String(en.average),
        `${emojiFor(en.rubricKey)} ${en.rubricLabel}`
      ]);

      doc.autoTable({
        head: summaryHead,
        body: summaryBody,
        startY: cursorY,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [6,78,59], textColor: 255 },
        margin: { left: 14, right: 14 }
      });

      cursorY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : cursorY + 8;
    } else {
      doc.text('No summary available.', 14, cursorY);
      cursorY += 10;
    }

    // Insights (text paragraphs)
    const insights = buildInsights(filtered);
    if (insights.length) {
      doc.setFontSize(11);
      doc.text('Smart Insights', 14, cursorY);
      cursorY += 6;
      doc.setFontSize(10);

      insights.forEach(line => {
        const split = doc.splitTextToSize(line, pageWidth - 28); // left/right margins
        if (cursorY + (split.length * 6) > doc.internal.pageSize.getHeight() - 14) {
          doc.addPage();
          cursorY = 14;
        }
        doc.text(split, 14, cursorY);
        cursorY += split.length * 6;
      });
    }

    // Save file
    const filename = `SmartScores_Report_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.pdf`;
    doc.save(filename);
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

    arr.forEach((r) => {
      const tr = document.createElement('tr');

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
      const badgeWrap = document.createElement('div');
      badgeWrap.innerHTML = rubricHtml(r.meanScore);
      rubricCell.appendChild(badgeWrap);

      const actions = document.createElement('div');
      actions.className = 'record-actions';
      actions.style.marginLeft = '8px';
      const btnE = document.createElement('button');
      btnE.textContent = 'Edit';
      btnE.addEventListener('click', () => {
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

  // RENDER SUMMARY: average per teacher+subject+grade+stream+term+year from cumulative exams entered for that term.
  function renderSummary(arr) {
    const entries = buildSummaryEntries(arr);

    if (!entries.length) {
      summaryDiv.innerHTML = '<div>No summary available.</div>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'summary-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Teacher</th>
          <th>Subject</th>
          <th>Grade</th>
          <th>Stream</th>
          <th>Term</th>
          <th>Year</th>
          <th>Exams</th>
          <th>Average</th>
          <th>Rubric</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    entries.forEach(en => {
      const tr = document.createElement('tr');
      const add = (txt) => {
        const td = document.createElement('td');
        td.textContent = txt;
        return td;
      };
      tr.appendChild(add(en.teacher));
      tr.appendChild(add(en.subject));
      tr.appendChild(add(en.grade));
      tr.appendChild(add(en.stream));
      tr.appendChild(add(en.term));
      tr.appendChild(add(en.year));
      tr.appendChild(add(en.examsCount));
      tr.appendChild(add(en.average));
      const rubricTd = document.createElement('td');
      rubricTd.innerHTML = `<span style="color:${en.rubricColor};font-weight:700">${emojiFor(en.rubricKey)} ${en.rubricLabel}</span>`;
      tr.appendChild(rubricTd);
      tbody.appendChild(tr);
    });

    summaryDiv.innerHTML = '';
    summaryDiv.appendChild(table);
  }

  // Build grouped summary entries (per teacher+subject+grade+stream+term+year)
  // Average is computed from all exam records present (opener, mid term, end term — but only those entered).
  function buildSummaryEntries(arr) {
    if (!arr.length) return [];
    const map = {};
    // group by teacher|subject|grade|stream|term|year
    arr.forEach(r => {
      const key = `${r.teacher}|||${r.subject}|||${r.grade}|||${r.stream}|||${r.term}|||${r.year}`;
      if (!map[key]) map[key] = {
        teacher: r.teacher,
        subject: r.subject,
        grade: r.grade,
        stream: r.stream,
        term: r.term,
        year: r.year,
        total: 0,
        count: 0,
        examTypes: new Set()
      };
      map[key].total += r.meanScore;
      map[key].count += 1;
      map[key].examTypes.add(r.examType);
    });

    const entries = Object.values(map).map(e => {
      const avg = e.count ? Number((e.total / e.count).toFixed(2)) : 0;
      const r = rubric(avg);
      return {
        teacher: e.teacher,
        subject: e.subject,
        grade: e.grade,
        stream: e.stream,
        term: e.term,
        year: e.year,
        examsCount: e.count, // number of exam records used in this term average
        examsList: Array.from(e.examTypes).sort().join(', '), // for reference if needed
        average: avg,
        rubricKey: r.key,
        rubricLabel: r.label,
        rubricColor: r.color
      };
    });

    // sort by teacher, subject, year, term for readability
    entries.sort((a,b) => {
      if (a.teacher !== b.teacher) return a.teacher.localeCompare(b.teacher, undefined, {numeric:true});
      if (a.subject !== b.subject) return a.subject.localeCompare(b.subject, undefined, {numeric:true});
      if (a.year !== b.year) return a.year.localeCompare(b.year, undefined, {numeric:true});
      return a.term.localeCompare(b.term, undefined, {numeric:true});
    });

    return entries;
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
    // Group by teacher + subject + grade + stream
    const map = {};
    arr.forEach(r => {
      const key = `${r.teacher}|||${r.subject}|||${r.grade}|||${r.stream}`;
      if (!map[key]) map[key] = {teacher:r.teacher, subject:r.subject, grade:r.grade, stream:r.stream, total:0, count:0};
      map[key].total += r.meanScore;
      map[key].count += 1;
    });
    const entries = Object.values(map);
    // sort by avg desc
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

  // Build insights strings for PDF (plain text)
  function buildInsights(arr) {
    if (!arr.length) return [];
    const map = {};
    arr.forEach(r => {
      const key = `${r.teacher}|||${r.subject}|||${r.grade}|||${r.stream}`;
      if (!map[key]) map[key] = {teacher:r.teacher, subject:r.subject, grade:r.grade, stream:r.stream, total:0, count:0};
      map[key].total += r.meanScore;
      map[key].count += 1;
    });
    const entries = Object.values(map);
    entries.sort((a,b) => (b.total/b.count) - (a.total/a.count));
    return entries.map(e => {
      const avg = Number((e.total / e.count).toFixed(2));
      const r = rubric(avg);
      return `${emojiFor(r.key)} ${e.teacher} (${e.subject} - Grade ${e.grade}, ${e.stream}) is ${r.label} with an average of ${avg}.`;
    });
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
