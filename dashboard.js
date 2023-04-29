(function initDashboard(trackerConfig) {
  const { numeral, natsort, filesize, io, Highcharts, preact, htm } = window;
  async function getJSON(url, callback) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(await response.text());
    callback(await response.json());
  }
  const html = htm.bind(preact.h);
  const queuestats_frame = document.getElementById("queuestats");
  const sorter = natsort();
  let redraw_timer = null;
  const redraw_interval = 500;
  const redraw_enqueue = () => {
    if (redraw_timer !== null) {
      return;
    }
    redraw_timer = setTimeout(() => {
      redrawStats();
      redraw_timer = null;
    }, redraw_interval);
  };
  function DifferenceSeries(periodDuration, unitDuration) {
    this.periodDuration = periodDuration;
    this.unitDuration = unitDuration;
    this.startOfPeriodIndex = null;
    this.data = [];
    this.rateData = [];
    this.series = null;
  }
  DifferenceSeries.prototype.addPoint = function (
    options,
    redraw,
    shift,
    animation
  ) {
    let idx = this.startOfPeriodIndex,
      dur = this.periodDuration,
      data = this.data,
      n = data.length;
    if (idx != null && n > 1) {
      while (idx < n && data[idx][0] < options[0] - dur) {
        idx++;
      }
      idx = idx - 1;

      if (idx >= 0) {
        let prevPoint = data[idx];
        let timeDiff = options[0] - prevPoint[0];
        let valueDiff = options[1] - prevPoint[1];
        let rate = valueDiff / (timeDiff / this.unitDuration);
        if (this.series) {
          this.series.addPoint([options[0], rate], redraw, shift, animation);
        } else {
          this.rateData.push([options[0], rate]);
        }

        this.startOfPeriodIndex = idx + 1;
      }
    } else {
      this.startOfPeriodIndex = 0;
    }
    this.data.push(options);
  };

  function makeEmpty(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function makeTD() {
    let td, span, span2;
    td = document.createElement("td");
    switch (arguments[0]) {
      case "legend":
        span = document.createElement("span");
        span2 = document.createElement("span");
        span2.innerHTML = "&#8226;";
        span2.id = "legend-" + arguments[1];
        span.appendChild(span2);
        span.className = "text";
        span.appendChild(document.createTextNode(" " + arguments[1]));
        td.appendChild(span);
        break;

      case "text":
        span = document.createElement("span");
        span.className = "text";
        span.appendChild(document.createTextNode(arguments[1]));
        td.appendChild(span);
        break;

      case "num":
        td.className = "num";
        span = document.createElement("span");
        span.className = "value";
        span.appendChild(document.createTextNode(arguments[1]));
        td.appendChild(span);
        span = document.createElement("span");
        span.className = "unit";
        span.appendChild(document.createTextNode(arguments[2]));
        td.appendChild(span);
        break;
    }
    return td;
  }

  window.addEventListener("hashchange", function () {
    updateChart();
    redrawStats();
  });

  const makeNum = ([value, unit], append) =>
    html`<td class="num">
      <span class="value">${value}</span
      ><span class="unit">${unit + (append ? append : "")}</span>
    </td>`;
  function StatsTable() {
    const showAll = ("" + location.hash).match("show-all");
    const out = stats.counts.out;
    const todo = stats.counts.todo;
    const domainRows = [];
    for (const domain in stats.domain_bytes) {
      if (trackerConfig.domains[domain]) {
        domainRows.push(html`<tr>
          <td><span class="text">${trackerConfig.domains[domain]}</span></td>
          ${makeNum(
            filesize(stats.domain_bytes[domain], {
              standard: "iec",
              unix: false,
              output: "array",
            })
          )}
          ${makeNum(
            filesize(stats.domain_bytes[domain] / stats.counts.done, {
              standard: "iec",
              unix: false,
              output: "array",
            }),
            "/u"
          )}
        </tr>`);
      }
    }
    const downloaders = stats.downloaders.sort(function (a, b) {
      return stats.downloader_bytes[b] - stats.downloader_bytes[a];
    });
    return html`<table class="items-count">
        <tbody>
          <tr>
            <td><span class="text">items</span></td>
            <td class="num">
              <span class="value">
                ${numeral(Number(stats.counts.done))
                  .format("0.00a")
                  .toUpperCase()
                  .replace(/\.00$/, "")}
              </span>
              <span class="unit">done</span>
              ${out > 0 &&
              html`${" + "}
                <span class="value">
                  ${numeral(Number(out))
                    .format("0.00a")
                    .toUpperCase()
                    .replace(/\.00$/, "")}
                </span>
                <span class="unit">out</span>`}
              ${" + "}
              <span class="value">
                ${numeral(Number(todo))
                  .format("0.00a")
                  .toUpperCase()
                  .replace(/\.00$/, "")}
              </span>
              <span class="unit">to do</span>
            </td>
          </tr>
        </tbody>
      </table>
      <table>
        <tbody>
          ${domainRows}
        </tbody>
        ${domainRows.length > 1 &&
        html`<tfoot>
          <tr>
            <td><span class="text">total</span></td>
            ${makeNum(
              filesize(stats.total_bytes, {
                standard: "iec",
                unix: false,
                output: "array",
              })
            )}
            ${makeNum(
              filesize(stats.total_bytes / stats.counts.done, {
                standard: "iec",
                unix: false,
                output: "array",
              }),
              "/u"
            )}
          </tr>
        </tfoot>`}
      </table>
      <table>
        <tbody>
          ${(showAll
            ? downloaders
            : downloaders.slice(0, trackerConfig.numberOfDownloaders)
          ).map((downloader) => {
            {
              return html`<tr
                style=${{ cursor: "pointer" }}
                key=${downloader}
                data-downloader=${downloader}
              >
                <td>
                  <span class="text">
                    <span id="legend-${downloader}">•</span>
                    ${" " + downloader}
                  </span>
                </td>
                ${makeNum(
                  filesize(stats.downloader_bytes[downloader], {
                    standard: "iec",
                    unix: false,
                    output: "array",
                  })
                )}
                ${makeNum([
                  numeral(Number(stats.downloader_count[downloader]))
                    .format("0.00a")
                    .toUpperCase()
                    .replace(/\.00$/, ""),
                  "items",
                ])}
              </tr>`;
            }
          })}
        </tbody>
      </table>
      <a href=${showAll ? "#" : "#show-all"} id="show-all"
        >${showAll ? "\u2013 " : "+ "}<span
          >${showAll ? "Show fewer" : "Show all"}</span
        ></a
      > `;
  }

  let firstRedraw = true;
  function redrawStats() {
    if (firstRedraw) {
      document.getElementById("left").textContent = "";
      firstRedraw = false;
    }
    preact.render(html`<${StatsTable} />`, document.getElementById("left"));
    if (stats.stats && stats.stats.queues) {
      const kvPair = ([k, v]) =>
        html`<div key="${k}">${k}: <span>${v}</span></div>`;
      const queuestats_text = [
        ...Object.entries(stats.stats.queues)
          .sort((a, b) => sorter(a[0], b[0]))
          .map(kvPair),
        html`<div>-----</div>`,
        ...Object.entries(stats.stats.values)
          .sort((a, b) => sorter(a[0], b[0]))
          .map(kvPair),
        html`<div>-----</div>`,
        kvPair([
          `reclaim rate`,
          `${Math.round(stats.counts.rcr * 100)}% (${stats.counts.rcr})`,
        ]),
        kvPair([
          `reclaim serve rate`,
          `${Math.round(stats.counts.rcsr * 100)}% (${stats.counts.rcsr})`,
        ]),
        kvPair([
          `item request serve rate`,
          `${Math.round(stats.counts.irsr * 100)}% (${stats.counts.irsr})`,
        ]),
        kvPair([
          `item filter rate`,
          `${Math.round(stats.counts.ifir * 100)}% (${stats.counts.ifir})`,
        ]),
        kvPair([
          `item fail rate`,
          `${Math.round(stats.counts.ifar * 100)}% (${stats.counts.ifar})`,
        ]),
      ];
      preact.render(queuestats_text, queuestats_frame);
    }
  }

  let lastRedrawn = null;
  let downloaderSeries = {};
  function updateChart() {
    if (!chart) return;

    let downloaders = stats.downloaders.sort(function (a, b) {
      return stats.downloader_bytes[b] - stats.downloader_bytes[a];
    });

    chart.series[0].addPoint(
      [new Date() * 1, stats.counts.done],
      false,
      false,
      false
    );
    stats.items_done_rate.addPoint(
      [new Date() * 1, stats.counts.done],
      false,
      false,
      false
    );
    stats.bytes_download_rate.addPoint(
      [new Date() * 1, stats.total_bytes],
      false,
      false,
      false
    );

    for (
      let i = 0;
      i < downloaders.length && i < trackerConfig.numberOfDownloadersInGraph;
      i++
    ) {
      let downloader = downloaders[i];
      let series = downloaderSeries[downloader];
      if (!series) {
        let seriesData = [];
        if (stats.downloader_chart[downloader]) {
          seriesData = stats.downloader_chart[downloader];
          for (let j = seriesData.length - 1; j >= 0; j--) {
            seriesData[j][0] = seriesData[j][0] * 1000;
            seriesData[j][1] = seriesData[j][1] / (1024 * 1024 * 1024);
          }
        }
        seriesData.push([
          new Date() * 1,
          stats.downloader_bytes[downloader] / (1024 * 1024 * 1024),
        ]);

        downloaderSeries[downloader] = series = chart.addSeries(
          {
            name: downloader,
            marker: { enabled: false },
            shadow: false,
            data: seriesData,
            stickyTracing: false,
          },
          false,
          false
        );
      } else {
        series.addPoint(
          [
            new Date() * 1,
            stats.downloader_bytes[downloader] / (1024 * 1024 * 1024),
          ],
          false,
          false,
          false
        );
      }

      let span = document.getElementById("legend-" + downloader);
      if (span) {
        span.style.color = series.color;
        span.style.visibility = series.visible ? "visible" : "hidden";
      }
    }

    if (lastRedrawn == null || new Date() - lastRedrawn > 30 * 1000) {
      lastRedrawn = new Date();
      chart.redraw();
    }
  }

  function handleDownloaderClick(evt) {
    let tr = evt.target;
    while (tr && tr.nodeName != "TR" && tr.parentNode) {
      tr = tr.parentNode;
    }
    if (tr && tr.nodeName == "TR" && tr.dataset.downloader) {
      let downloader = tr.dataset.downloader;
      if (downloaderSeries[downloader]) {
        let series = downloaderSeries[downloader];
        if (series.visible) series.hide();
        else series.show();

        let span = document.getElementById("legend-" + downloader);
        if (span) {
          span.style.visibility = series.visible ? "visible" : "hidden";
        }

        chart.series[0].hide();
        chart.series[0].show();
      }
    }
  }

  function updateStats(msg, dupe) {
    stats.counts = msg.counts;
    stats.queuestats = msg.queuestats;
    stats.stats = msg.stats;
    if (!dupe) {
      if (!stats.downloader_bytes[msg.downloader]) {
        stats.downloader_bytes[msg.downloader] = 0;
        stats.downloader_count[msg.downloader] = 0;
        stats.downloaders.push(msg.downloader);
      }
      stats.downloader_count[msg.downloader] += msg.items.length;
    }
    for (let domain in msg.domain_bytes) {
      const bytes = msg.domain_bytes[domain] * 1;
      if (!stats.domain_bytes[domain]) {
        stats.domain_bytes[domain] = 0;
      }
      stats.domain_bytes[domain] += bytes;
      stats.downloader_bytes[msg.downloader] += bytes;
      stats.total_bytes += bytes;
    }
    redraw_enqueue();
    updateChart();
  }

  function addLog(msg) {
    let tbody, tr;
    tbody = document.getElementById("log");

    tr = document.createElement("tr");
    tr.className = [
      msg.user_agent && msg.user_agent.match(/Warrior$/)
        ? "warrior"
        : undefined,
      msg.is_duplicate && msg.items.length === 1 ? "dup" : undefined,
    ]
      .filter((className) => className !== undefined)
      .join(" ");
    let downloaderTd = makeTD("text", msg.downloader);
    //var itemTextTd = makeTD('text', msg.items.length > 1 ? (msg.move_items.length !== msg.items.length ? (msg.move_items.length + '/') : '') + msg.items.length + ' items' : msg.item);
    //var itemTextTd = makeTD('text', msg.items.length > 1 ? msg.move_items.length + '/' + msg.items.length + ' items' + (msg.move_items.length !== msg.items.length ? ' (-' + (msg.items.length - msg.move_items.length) + ')' : '') : msg.item);
    let itemTextTd = makeTD(
      "text",
      msg.items.length > 1
        ? msg.items.length +
            " items" +
            (msg.move_items.length !== msg.items.length
              ? " (" + (msg.items.length - msg.move_items.length) + " dupes)"
              : "")
        : msg.item
    );
    let size = filesize(msg.bytes, {
      standard: "iec",
      unix: false,
      output: "array",
    });
    let sizeTd = makeTD("num", size[0], size[1]);
    downloaderTd.className = "downloader";
    itemTextTd.title = msg.item;
    tr.appendChild(downloaderTd);
    tr.appendChild(itemTextTd);
    tr.appendChild(sizeTd);

    downloaderTd.title = "";

    if (msg.version) {
      downloaderTd.title = "Version: " + msg.version;
    }
    if (msg.user_agent) {
      downloaderTd.title += " | User Agent: " + msg.user_agent;
    }

    tbody.insertBefore(tr, tbody.firstChild);

    while (tbody.childNodes.length > trackerConfig.numberOfLogLines) {
      tbody.removeChild(tbody.childNodes[trackerConfig.numberOfLogLines]);
    }
  }

  function getLogHostURL() {
    if (document.location.protocol == "http:") {
      return trackerConfig.logHost;
    } else {
      return trackerConfig.sslLogHost;
    }
  }

  function startLogClient() {
    let socket = io.connect(
      document.location.protocol +
        "//" +
        getLogHostURL() +
        "/" +
        trackerConfig.logChannel
    );
    socket.on("log_message", function (data) {
      let msg = JSON.parse(data);
      if (msg.downloader && msg.item && msg.bytes !== undefined) {
        addLog(msg);
        updateStats(msg, msg.is_duplicate);
      }
    });
  }

  function initLog() {
    getJSON(
      document.location.protocol +
        "//" +
        getLogHostURL() +
        "/recent/" +
        trackerConfig.logChannel,
      function (messages) {
        for (let i = 0; i < messages.length; i++) {
          let msg = messages[i];
          if (msg.downloader && msg.item && msg.bytes !== undefined) {
            addLog(msg);
          }
        }
        startLogClient();
      }
    );
  }

  let chart = null;
  function buildChart() {
    let maxMinTimestamp = 0;
    if (stats.items_done_chart.length > 0) {
      maxMinTimestamp = Math.max(
        maxMinTimestamp,
        stats.items_done_chart[0][0] * 1000
      );
    }
    for (let i in stats.downloader_chart) {
      if (stats.downloader_chart[i].length > 0) {
        maxMinTimestamp = Math.max(
          maxMinTimestamp,
          stats.downloader_chart[i][0][0] * 1000
        );
      }
    }
    if (maxMinTimestamp == 0) {
      maxMinTimestamp = null;
    }

    let seriesData = stats.items_done_chart;
    for (let j = seriesData.length - 1; j >= 0; j--) {
      seriesData[j][0] *= 1000;
    }

    // take the hourly rate based on a moving interval of 10 minutes
    let diffSeries = new DifferenceSeries(
      trackerConfig.movingAverageInterval * 60000,
      60 * 60000
    );
    for (let j = 0; j < seriesData.length; j++) {
      diffSeries.addPoint(seriesData[j]);
    }
    stats.items_done_rate = diffSeries;

    // count MB/s based on a moving interval of 10 minutes
    diffSeries = new DifferenceSeries(
      trackerConfig.movingAverageInterval * 60000,
      1000
    );
    let perDownloaderData = [],
      perDownloaderIndex = [];
    for (let i in stats.downloader_chart) {
      perDownloaderData.push(stats.downloader_chart[i]);
      perDownloaderIndex.push(0);
    }
    let sumBytes = 0;
    while (perDownloaderData.length > 0) {
      let minTime = null,
        minTimeIdx = null,
        j;
      for (j = perDownloaderData.length - 1; j >= 0; j--) {
        let entry = perDownloaderData[j][perDownloaderIndex[j]];
        if (entry && (minTime == null || entry[0] <= minTime)) {
          minTime = entry[0];
          minTimeIdx = j;
        }
      }
      if (j < 0) break;
      if (minTimeIdx != null) {
        if (perDownloaderIndex[minTimeIdx] > 0) {
          sumBytes -=
            perDownloaderData[minTimeIdx][
              perDownloaderIndex[minTimeIdx] - 1
            ][1];
        }
        sumBytes +=
          perDownloaderData[minTimeIdx][perDownloaderIndex[minTimeIdx]][1];
        diffSeries.addPoint([minTime * 1000, sumBytes]);
        perDownloaderIndex[minTimeIdx]++;
        if (
          perDownloaderIndex[minTimeIdx] >= perDownloaderData[minTimeIdx].length
        ) {
          perDownloaderIndex.splice(minTimeIdx, 1);
          perDownloaderData.splice(minTimeIdx, 1);
        }
      }
    }
    stats.bytes_download_rate = diffSeries;

    chart = new Highcharts.StockChart({
      chart: { renderTo: "chart-container", zoomType: "x" },
      title: { text: null },
      legend: { enabled: false },
      credits: { enabled: false },
      rangeSelector: {
        buttons: [
          { type: "day", count: 1, text: "1d" },
          { type: "week", count: 1, text: "1w" },
          { type: "month", count: 1, text: "1m" },
          { type: "all", text: "all" },
        ],
      },
      xAxis: { type: "datetime" },
      yAxis: [
        {
          min: 0,
          maxPadding: 0,
          title: { text: "GB done" },
          labels: { align: "left", x: 0, y: -2 },
          height: 200,
        },
        {
          min: 0,
          maxPadding: 0,
          title: { text: "items", style: { color: "#aaa" } },
          opposite: true,
          labels: { align: "right", x: 0, y: -2 },
          height: 200,
        },
        {
          min: 0,
          maxPadding: -0.5,
          title: { text: "bytes/s", style: { color: "#000" } },
          labels: { align: "left", x: 0, y: -2 },
          height: 70,
          top: 260,
          offset: 0,
        },
        {
          min: 0,
          maxPadding: -0.5,
          title: { text: "items/hour" },
          opposite: true,
          labels: { align: "right", x: 0, y: -2 },
          height: 70,
          top: 260,
          offset: 0,
        },
      ],
      series: [
        {
          name: "items done",
          type: "area",
          data: seriesData,
          color: "#aaa",
          fillColor: "#eee",
          shadow: false,
          marker: { enabled: false },
          yAxis: 1,
        },
        {
          name: "items/hour",
          type: "spline",
          data: stats.items_done_rate.rateData,
          color: "#6D869F",
          shadow: false,
          marker: { enabled: false },
          yAxis: 3,
        },
        {
          name: "bytes/s",
          type: "spline",
          data: stats.bytes_download_rate.rateData,
          color: "#000",
          shadow: false,
          marker: { enabled: false },
          yAxis: 2,
        },
      ],
      tooltip: {
        crosshairs: false,
        shared: false,
        snap: 0,
      },
    });

    stats.items_done_rate.series = chart.series[1];
    stats.bytes_download_rate.series = chart.series[2];

    document.body.addEventListener("click", handleDownloaderClick);
  }

  function refreshUpdateStatus() {
    if (!trackerConfig.updateStatusPath) return;

    getJSON(trackerConfig.updateStatusPath, function (data) {
      if (data.current_version == null || data.current_version == "") return;

      let mustUpdate = [];
      for (let d in data.downloader_version) {
        if (data.downloader_version[d] < data.current_version) {
          mustUpdate.push(d);
        }
      }

      let p = document.getElementById("update-status");
      p.style.display = "none";
      makeEmpty(p);

      if (mustUpdate.length > 0) {
        mustUpdate.sort();

        let sentence =
          data.current_version_update_message + ": " + mustUpdate.join(", ");
        p.appendChild(document.createTextNode(sentence));
        p.style.display = "block";
      }
    });
  }

  let previousChartDataUrls = [];
  function handleCharts(newCharts) {
    if (!stats.downloader_chart) stats.downloader_chart = {};
    if (!stats.items_done_chart) stats.items_done_chart = [];
    if (!stats.items_done_chart) stats.items_done_chart = [];

    for (let d in newCharts.downloader_chart) {
      if (!stats.downloader_chart[d]) stats.downloader_chart[d] = [];
      stats.downloader_chart[d] = newCharts.downloader_chart[d].concat(
        stats.downloader_chart[d]
      );
    }
    stats.items_done_chart = newCharts.items_done_chart.concat(
      stats.items_done_chart
    );
    stats.bytes_done_chart = newCharts.bytes_done_chart.concat(
      stats.bytes_done_chart
    );

    if (newCharts.previous_chart_data_urls) {
      previousChartDataUrls.push.apply(
        previousChartDataUrls,
        newCharts.previous_chart_data_urls
      );
    }

    if (previousChartDataUrls.length > 0) {
      getJSON(previousChartDataUrls.shift(), handleCharts);
    } else {
      buildChart();
      redraw_enqueue();
      updateChart();
    }
  }

  let stats = null;
  getJSON(trackerConfig.statsPath, function (newStats) {
    stats = newStats;

    redraw_enqueue();

    initLog();

    if (trackerConfig.updateStatusPath) {
      refreshUpdateStatus();
      window.setInterval(function () {
        refreshUpdateStatus();
      }, 60000);
    }

    getJSON(trackerConfig.chartsPath, handleCharts);
  });

  const howToHelpCue = document.querySelector("#how-to-help-cue");
  const howToHelp = document.querySelector("#how-to-help");
  howToHelpCue.addEventListener("click", function (e) {
    e.preventDefault();
    if (typeof howToHelpCue.animate !== "undefined") {
      const cueHeight = howToHelpCue.getBoundingClientRect().height;
      howToHelp.style.overflow = "hidden";
      howToHelp.style.display = "block";
      const howToHelpHeight = howToHelp.getBoundingClientRect().height;
      howToHelp
        .animate(
          [
            { maxHeight: "0", transform: "translateY(0px)" },
            {
              maxHeight: howToHelpHeight + "px",
              transform: "translateY(-" + cueHeight + "px)",
            },
          ],
          {
            duration: 400,
            iterations: 1,
          }
        )
        .finished.then(() => (howToHelpCue.style.display = "none"));
    } else {
      howToHelpCue.firstElementChild.style.display = "none";
      howToHelp.style.display = "block";
    }
  });
})(window.trackerConfig);
