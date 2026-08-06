(function () {
  var ALERT_WINDOW_DAYS = 7;

  var STAGE_INFO = {
    F: { next: 'L', watchLabel: 'Pour Slab', watchField: 'pourSlab', dueLabel: 'Drying Home', dueField: 'dryingHome' },
    L: { next: 'O', watchLabel: 'Drywall', watchField: 'drywall', dueLabel: 'Cabinets', dueField: 'cabinets' },
    O: { next: 'Q', watchLabel: 'Cabinets', watchField: 'cabinets', dueLabel: 'Final Clean', dueField: 'finalClean' },
    Q: null
  };

  var STAGE_NAMES = { F: 'Foundation', L: 'Lumber/Framing', O: 'Cabinets/Trim', Q: 'Final Clean' };

  function parseDate(s) {
    if (!s) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  }

  function todayLocalMidnight() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  }

  function fmtDate(s) {
    var d = parseDate(s);
    if (!d) return '—';
    return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
  }

  // Returns { status: 'overdue'|'approaching'|'ontrack'|'done', transition, watchDate, dueDate, daysToDue }
  function evaluateHouse(h, today) {
    var info = STAGE_INFO[h.stage];
    if (!info) {
      return { status: 'done', transition: null };
    }
    var watchDate = parseDate(h[info.watchField]);
    var dueDate = parseDate(h[info.dueField]);
    var watchPast = watchDate ? daysBetween(watchDate, today) >= 0 : false;

    if (!watchPast) {
      return { status: 'ontrack', transition: info, watchDate: h[info.watchField], dueDate: h[info.dueField], daysToDue: dueDate ? daysBetween(today, dueDate) : null };
    }

    var daysToDue = dueDate ? daysBetween(today, dueDate) : null;
    var status;
    if (daysToDue === null) {
      status = 'approaching';
    } else if (daysToDue < 0) {
      status = 'overdue';
    } else if (daysToDue <= ALERT_WINDOW_DAYS) {
      status = 'approaching';
    } else {
      status = 'ontrack';
    }
    return { status: status, transition: info, watchDate: h[info.watchField], dueDate: h[info.dueField], daysToDue: daysToDue };
  }

  function statusLabel(status, daysToDue) {
    if (status === 'overdue') return (daysToDue !== null ? Math.abs(daysToDue) + 'd overdue' : 'Overdue');
    if (status === 'approaching') {
      if (daysToDue === 0) return 'Due today';
      if (daysToDue === 1) return 'Due tomorrow';
      return 'Due in ' + daysToDue + 'd';
    }
    if (status === 'done') return 'Final stage';
    return 'On track';
  }

  var houses = (window.HousesData && window.HousesData.houses) || [];
  var developmentNames = (window.HousesData && window.HousesData.developmentNames) || {};

  var elSearch = document.getElementById('search');
  var elFilterStatus = document.getElementById('filterStatus');
  var elFilterStage = document.getElementById('filterStage');
  var elFilterDev = document.getElementById('filterDev');
  var elList = document.getElementById('list');
  var elEmpty = document.getElementById('emptyState');
  var elResultsCount = document.getElementById('resultsCount');
  var elUpdatedAt = document.getElementById('updatedAt');
  var elCountOverdue = document.getElementById('countOverdue');
  var elCountApproaching = document.getElementById('countApproaching');
  var elCountOntrack = document.getElementById('countOntrack');

  // Populate development filter
  var devSet = {};
  houses.forEach(function (h) { if (h.dev) devSet[h.dev] = true; });
  Object.keys(devSet).sort().forEach(function (code) {
    var opt = document.createElement('option');
    opt.value = code;
    opt.textContent = developmentNames[code] || code;
    elFilterDev.appendChild(opt);
  });

  if (window.HousesData && window.HousesData.lastUpdated) {
    elUpdatedAt.textContent = 'Data as of ' + window.HousesData.lastUpdated;
  }

  var today = todayLocalMidnight();
  var evaluated = houses.map(function (h) {
    var ev = evaluateHouse(h, today);
    return Object.assign({}, h, ev);
  });

  var counts = { overdue: 0, approaching: 0, ontrack: 0 };
  evaluated.forEach(function (h) {
    if (h.status === 'overdue') counts.overdue++;
    else if (h.status === 'approaching') counts.approaching++;
    else if (h.status === 'ontrack') counts.ontrack++;
  });
  elCountOverdue.textContent = counts.overdue;
  elCountApproaching.textContent = counts.approaching;
  elCountOntrack.textContent = counts.ontrack;

  function render() {
    var q = elSearch.value.trim().toLowerCase();
    var statusFilter = elFilterStatus.value;
    var stageFilter = elFilterStage.value;
    var devFilter = elFilterDev.value;

    var filtered = evaluated.filter(function (h) {
      if (statusFilter && h.status !== statusFilter) return false;
      if (stageFilter && h.stage !== stageFilter) return false;
      if (devFilter && h.dev !== devFilter) return false;
      if (q) {
        var hay = [h.address, h.houseNumber, h.pm, h.buyer].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    // Sort: overdue first (most overdue first), then approaching (soonest first), then ontrack
    var statusOrder = { overdue: 0, approaching: 1, ontrack: 2, done: 3 };
    filtered.sort(function (a, b) {
      var oa = statusOrder[a.status], ob = statusOrder[b.status];
      if (oa !== ob) return oa - ob;
      var da = a.daysToDue === null || a.daysToDue === undefined ? 0 : a.daysToDue;
      var db = b.daysToDue === null || b.daysToDue === undefined ? 0 : b.daysToDue;
      return da - db;
    });

    elResultsCount.textContent = filtered.length + (filtered.length === 1 ? ' house' : ' houses');
    elList.innerHTML = '';
    elEmpty.style.display = filtered.length ? 'none' : 'block';

    filtered.forEach(function (h) {
      var card = document.createElement('div');
      card.className = 'house-card status-' + h.status;

      var info = document.createElement('div');
      info.className = 'house-info';

      var addr = document.createElement('div');
      addr.className = 'house-address';
      addr.textContent = h.address || h.houseNumber;
      info.appendChild(addr);

      var meta = document.createElement('div');
      meta.className = 'house-meta';
      meta.innerHTML =
        '<span>#' + h.houseNumber + '</span>' +
        '<span>Comp ' + (h.comp || '—') + '</span>' +
        '<span>' + (developmentNames[h.dev] || h.dev) + '</span>' +
        '<span>' + h.model + (h.elevCode ? '/' + h.elevCode : '') + '</span>' +
        '<span>PM: ' + (h.pm || '—') + '</span>';
      info.appendChild(meta);

      if (h.transition) {
        var trans = document.createElement('div');
        trans.className = 'house-transition';
        trans.innerHTML = 'Stage <b>' + h.stage + '</b> (' + STAGE_NAMES[h.stage] + ') → release <b>' + h.transition.next + '</b>: ' +
          h.transition.watchLabel + ' <b>' + fmtDate(h.watchDate) + '</b>, ' +
          h.transition.dueLabel + ' <b>' + fmtDate(h.dueDate) + '</b>';
        info.appendChild(trans);
      } else {
        var doneDiv = document.createElement('div');
        doneDiv.className = 'house-transition';
        doneDiv.textContent = 'Stage Q — no further release needed';
        info.appendChild(doneDiv);
      }

      card.appendChild(info);

      var side = document.createElement('div');
      side.className = 'house-side';
      var badge = document.createElement('span');
      badge.className = 'badge ' + (h.status === 'done' ? 'ontrack' : h.status);
      badge.textContent = statusLabel(h.status, h.daysToDue);
      side.appendChild(badge);
      var stageBadge = document.createElement('div');
      stageBadge.style.marginTop = '8px';
      var sb = document.createElement('span');
      sb.className = 'badge stage';
      sb.textContent = 'Stage ' + h.stage;
      stageBadge.appendChild(sb);
      side.appendChild(stageBadge);
      card.appendChild(side);

      elList.appendChild(card);
    });
  }

  elSearch.addEventListener('input', render);
  elFilterStatus.addEventListener('change', render);
  elFilterStage.addEventListener('change', render);
  elFilterDev.addEventListener('change', render);

  render();
})();
