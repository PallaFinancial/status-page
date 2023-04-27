const maxDays = 30;

const PALLA_API_BASE_URL = "https://api.platform.palla.app/health";
const PALLA_SANDBOX_API_BASE_URL = "https://api.sandbox.palla.app/health";
const PALLA_API_VER = "v1";
const PALLA_SANDBOX_API_VER = "v1";

function genReportSection(container, title) {
  const sectionHeader = constructSection(title);
  if (!sectionHeader) return;
  sectionHeader.style.display = "flex";
  container.appendChild(sectionHeader);
  return sectionHeader;
}

function genIncidentsSection(container, title) {
  const sectionHeader = constructSection(title);
  if (!sectionHeader) return;
  sectionHeader.style.display = "flex";
  container.appendChild(sectionHeader);
  return sectionHeader;
}

async function genStatusStreamFromLog(container, data, { key, label, type }) {
  const statusStream = constructStatusStream(key, label, type, data);
  container.appendChild(statusStream);
}

async function genIncidenStreamFromLog(container, data, { key, label, type }) {
  const incidentStream = constructIncidentStatusStream(key, label, type, data);
  incidentStream.forEach((stream) => {
    container.appendChild(stream);
  });
}

async function genReportLog(env, { key, type }) {
  const response = await fetch(
    "logs/" + env + "/" + type + "/" + key + "_report.log"
  );

  let statusLines = "";
  if (response.ok) {
    statusLines = await response.text();
  }

  return normalizeData(statusLines);
}

async function genIncidentLog(env, { key, type }) {
  const response = await fetch(
    "logs/" + env + "/" + type + "/" + key + "_incident.log"
  );

  if (!response.ok) return;

  let statusLines = "";
  if (response.ok) {
    statusLines = await response.text();
  }

  if (!statusLines.length) return;

  return normalizeIncidentData(statusLines);
}

function constructSection(title) {
  return templatize("sectionTemplate", {
    section_title: title.toUpperCase(),
  });
}

function constructStatusStream(key, label, type, uptimeData) {
  let streamContainer = templatize("statusStreamContainerTemplate");
  for (var ii = maxDays - 1; ii >= 0; ii--) {
    let line = constructStatusLine(key, ii, uptimeData[ii]);
    streamContainer.appendChild(line);
  }

  const lastSet = uptimeData[0];
  const color = getColor(lastSet);

  const container = templatize("statusContainerTemplate", {
    title: label,
    color: color,
    src: `${type}.svg`,
    status: getStatusText(color),
    upTime: uptimeData.upTime,
  });

  container.appendChild(streamContainer);
  return container;
}

function constructIncidentStatusStream(key, label, type, data) {
  let incidents = [];
  Object.keys(data).forEach((date) => {
    if (!data[date]) return;
    data[date].forEach((status) => {
      if (status.result === "success") return;
      const formatedDate = new Date(status.time);
      incidents.push({
        date: `${formatedDate.toLocaleDateString({
          timezone: "America/New_York",
        })} ${formatedDate.toLocaleTimeString({
          timeazone: "America/New_York",
        })} EST`,
        status: status.result,
      });
    });
  });

  return incidents.map((incident) => {
    const template = templatize("incidentTemplate", {
      status: incident.status,
      date: incident.date,
      description: `${key} ${type}`,
    });
    template.style.display = "block";
    return template;
  });
}

function constructStatusLine(key, relDay, upTimeArray) {
  let date = new Date();
  date.setDate(date.getDate() - relDay);

  return constructStatusSquare(key, date, upTimeArray);
}

function getColor(uptimeVal) {
  return uptimeVal == null
    ? "nodata"
    : uptimeVal == 1
    ? "success"
    : uptimeVal < 0.3
    ? "failure"
    : "partial";
}

function constructStatusSquare(key, date, uptimeVal) {
  const color = getColor(uptimeVal);
  let square = templatize("statusSquareTemplate", {
    color: color,
    tooltip: getTooltip(key, date, color),
  });

  const show = () => {
    showTooltip(square, key, date, color);
  };
  square.addEventListener("mouseover", show);
  square.addEventListener("mousedown", show);
  square.addEventListener("mouseout", hideTooltip);
  return square;
}

let cloneId = 0;
function templatize(templateId, parameters) {
  let clone = document.getElementById(templateId).cloneNode(true);
  clone.id = "template_clone_" + cloneId++;
  if (!parameters) {
    return clone;
  }

  applyTemplateSubstitutions(clone, parameters);
  return clone;
}

function applyTemplateSubstitutions(node, parameters) {
  const attributes = node.getAttributeNames();
  for (var ii = 0; ii < attributes.length; ii++) {
    const attr = attributes[ii];
    const attrVal = node.getAttribute(attr);
    node.setAttribute(attr, templatizeString(attrVal, parameters));
  }

  if (node.childElementCount == 0) {
    node.innerText = templatizeString(node.innerText, parameters);
    if (node.className === "statusTitleIcon") {
      node.src = parameters.src;
    }
  } else {
    const children = Array.from(node.children);
    children.forEach((n) => {
      applyTemplateSubstitutions(n, parameters);
    });
  }
}

function templatizeString(text, parameters) {
  if (parameters) {
    for (const [key, val] of Object.entries(parameters)) {
      text = text.replaceAll("$" + key, val);
    }
  }
  return text;
}

function getStatusText(color) {
  return color == "nodata"
    ? "No Data Available"
    : color == "success"
    ? "Fully Operational"
    : color == "failure"
    ? "Major Outage"
    : color == "partial"
    ? "Outage Warning"
    : "Unknown";
}

function getStatusDescriptiveText(color) {
  return color == "nodata"
    ? "No Data Available: Health check was not performed."
    : color == "success"
    ? "No downtime recorded on this day."
    : color == "failure"
    ? "Major outages recorded on this day."
    : color == "partial"
    ? "Outage warning recorded on this day."
    : "Unknown";
}

function getTooltip(key, date, quartile, color) {
  let statusText = getStatusText(color);
  return `${key} | ${date.toDateString()} : ${quartile} : ${statusText}`;
}

function create(tag, className) {
  let element = document.createElement(tag);
  element.className = className;
  return element;
}

function normalizeData(statusLines) {
  const rows = statusLines.split("\n");
  const dateNormalized = splitRowsByDate(rows);

  let relativeDateMap = {};
  const now = Date.now();
  for (const [key, val] of Object.entries(dateNormalized)) {
    if (key == "upTime") {
      continue;
    }
    const relDays = getRelativeDays(now, new Date(key).getTime());
    relativeDateMap[relDays] = getDayAverage(val);
  }

  relativeDateMap.upTime = dateNormalized.upTime;
  return relativeDateMap;
}

function normalizeIncidentData(statusLines) {
  const rows = statusLines.split("\n");
  return splitIncidentRowsByDate(rows);
}

function getDayAverage(val) {
  if (!val || val.length == 0) {
    return null;
  } else {
    if (val.includes(0)) {
      return 0;
    } else if (val.includes(0.5)) {
      return 0.5;
    }
    return 1;
  }
}

function getRelativeDays(date1, date2) {
  return Math.floor(Math.abs((date1 - date2) / (24 * 3600 * 1000)));
}

function splitRowsByDate(rows) {
  let dateValues = {};
  let sum = 0,
    count = 0;
  for (var ii = 0; ii < rows.length; ii++) {
    const row = rows[ii];
    if (!row) {
      continue;
    }

    const [dateTimeStr, resultStr] = row.split(",", 2);
    const dateTime = new Date(
      Date.parse(dateTimeStr.replace(/-/g, "/") + " GMT")
    );
    const dateStr = dateTime.toDateString();

    let resultArray = dateValues[dateStr];
    if (!resultArray) {
      resultArray = [];
      dateValues[dateStr] = resultArray;
      if (dateValues.length > maxDays) {
        break;
      }
    }

    let result = 0;
    if (resultStr.trim() == "success") {
      result = 1;
    } else if (resultStr.trim() === "warn") {
      result = 0.5;
    }
    sum += result;
    count++;

    resultArray.push(result);
  }

  const upTime = count ? ((sum / count) * 100).toFixed(2) + "%" : "--%";
  dateValues.upTime = upTime;
  return dateValues;
}

function splitIncidentRowsByDate(rows) {
  let dateValues = {};
  let sum = 0,
    count = 0;
  for (var ii = 0; ii < rows.length; ii++) {
    const row = rows[ii];
    if (!row) {
      continue;
    }

    const [dateTimeStr, resultStr] = row.split(",", 2);
    const dateTime = new Date(
      Date.parse(dateTimeStr.replace(/-/g, "/") + " GMT")
    );
    const dateStr = dateTime.toDateString();

    let resultArray = dateValues[dateStr];
    if (!resultArray) {
      resultArray = [];
      dateValues[dateStr] = resultArray;
      if (dateValues.length > maxDays) {
        break;
      }
    }

    let result = "success";
    if (resultStr.trim() == "failure") {
      result = "failure";
    } else if (resultStr.trim() === "warn") {
      result = "warn";
    }
    sum += result;
    count++;
    resultArray.push({ result, time: dateTime });
  }

  return dateValues;
}

let tooltipTimeout = null;
function showTooltip(element, key, date, color) {
  clearTimeout(tooltipTimeout);
  const toolTipDiv = document.getElementById("tooltip");

  document.getElementById("tooltipDateTime").innerText = date.toDateString();
  document.getElementById("tooltipDescription").innerText =
    getStatusDescriptiveText(color);

  const statusDiv = document.getElementById("tooltipStatus");
  statusDiv.innerText = getStatusText(color);
  statusDiv.className = color;

  toolTipDiv.style.top = element.offsetTop + element.offsetHeight + 10;
  toolTipDiv.style.left =
    element.offsetLeft + element.offsetWidth / 2 - toolTipDiv.offsetWidth / 2;
  toolTipDiv.style.opacity = "1";
}

function hideTooltip() {
  tooltipTimeout = setTimeout(() => {
    const toolTipDiv = document.getElementById("tooltip");
    toolTipDiv.style.opacity = "0";
  }, 1000);
}

function validatePartnerId(id) {
  return ["palla.app", "test.partner"].includes(id.toLowerCase());
}

function validateEnv(env) {
  return ["production", "sandbox", "live-test"].includes(env.toLowerCase());
}

function getEnv() {
  let env = "production";
  let partnerId = "palla.app";
  const params = new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop),
  });
  if (params.partnerId && validatePartnerId(params.partnerId))
    partnerId = params.partnerId;
  if (params.env && validateEnv(params.env)) env = params.env;
  return { env, partnerId };
}

async function genServiceReport(services, section) {
  if (!services || (services && services.length < 1)) return;
  const { env, partnerId } = getEnv();
  const reportsEl = document.getElementById("reports");

  genReportSection(reportsEl, section);

  if (section === "web") {
    for (let ii = 0; ii < services.length; ii++) {
      const service = services[ii];
      if (!service || (service && service.env !== env)) {
        continue;
      }
      const log = await genReportLog(env, service);
      await genStatusStreamFromLog(reportsEl, log, service);
    }
    return;
  }

  const subServices = services.reduce(
    (acc, service) => {
      if (service.meta.tags.includes("auth")) {
        acc.auth.push(service);
      } else if (service.meta.tags.includes("accounts")) {
        acc.accounts.push(service);
      } else if (service.meta.tags.includes("links")) {
        acc.links.push(service);
      } else {
        acc.transfers.push(service);
      }
      return acc;
    },
    {
      auth: [],
      accounts: [],
      links: [],
      transfers: [],
    }
  );

  const groups = {
    auth: {
      service: {
        key: "authGroup",
        label: "Auth",
        type: "api",
      },
    },
    accounts: {
      service: {
        key: "accountsGroup",
        label: "Accounts",
        type: "api",
      },
    },
    links: {
      service: {
        key: "linksGroup",
        label: "Links",
        type: "api",
      },
    },
    transfers: {
      service: {
        key: "transfersGroup",
        label: "Transfers",
        type: "api",
      },
    },
  };

  await Promise.all(
    Object.keys(subServices).map(async (subService) => {
      for (let ii = 0; ii < subServices[subService].length; ii++) {
        const service = subServices[subService][ii];
        if (!service || (service && service.env !== env)) {
          continue;
        }
        const log = await genReportLog(env, service);
        Object.keys(log).forEach((key) => {
          if (
            groups[subService][key] !== 0 ||
            groups[subService][key] > log[key]
          ) {
            groups[subService][key] = log[key];
          }
        });
      }
    })
  );

  Object.keys(groups).forEach(async (group) => {
    await genStatusStreamFromLog(
      reportsEl,
      groups[group],
      groups[group].service
    );
  });
}

function setLoader(show) {
  const loader = document.getElementById("loaderContainer");
  const page = document.getElementById("pageContainer");
  if (show) {
    loader.style.display = "flex";
    page.style.opacity = 0.5;
  } else {
    loader.style.display = "none";
    page.style.opacity = 1;
  }
}

async function genAllReports() {
  setLoader(true);
  const res = await fetch("config.json");
  const config = await res.json();
  const apiServices = config.filter((item) => item.meta.tags.includes("api"));
  const webServices = config.filter((item) => item.meta.tags.includes("web"));
  await genServiceReport(webServices, "web");
  await genServiceReport(apiServices, "api");
  await genAllIncidents(config);
  setLoader(false);
}

async function genIncidentReport(services) {
  if (!services || (services && services.length < 1)) return;
  const { env } = getEnv();
  const reportsEl = document.getElementById("reports");

  genReportSection(reportsEl, "incidents");

  for (let ii = 0; ii < services.length; ii++) {
    const service = services[ii];
    if (!service || (service && service.env !== env)) {
      continue;
    }
    const log = await genIncidentLog(env, service);
    if (!log) return;
    await genIncidenStreamFromLog(reportsEl, log, service);
  }
}

async function genAllIncidents(config) {
  await genIncidentReport(config);
}

function onTabClick(_, env) {
  if (`?env=${env}` === window.location.search) return;
  window.location.search = `env=${env}`;
}

function setTabStyle() {
  const { env } = getEnv();
  const el = document.getElementById(`${env}Tab`);
  el.className = el.className += " active";
}
