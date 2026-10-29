import { companyFromUrl, normalizeLink } from "./company-from-url.js";

const STORAGE_KEY = "application-tracker.entries";
const WEEKLY_GOAL = 23;
const FOLLOW_UP_AFTER_DAYS = 14;
const DELETE_CONFIRM_MS = 3000;
const SAVED_NOTICE_MS = 2500;
const MS_PER_DAY = 86400000;
const MAX_DUPLICATES_SHOWN = 3;
const STATUSES = ["Applied", "Interviewing", "Offer", "Rejected"];
const ENTRY_FIELDS = ["id", "company", "role", "link", "referral", "status", "date", "createdAt"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TRUE_WORDS = ["true", "yes", "y", "1", "x"];
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const ISO_DATE_PATTERN = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/;
const US_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const NON_ALPHANUMERIC_PATTERN = /[^\p{L}\p{N}]+/gu;
const WHITESPACE_PATTERN = /\s+/g;
const CSV_SPECIAL_CHARACTER_PATTERN = /[",\r\n]/;
const BYTE_ORDER_MARK = "﻿";

const FILTERS = [
  { key: "all", label: "All", status: "" },
  { key: "waiting", label: "Waiting", status: "Applied" },
  { key: "interviewing", label: "Interviewing", status: "Interviewing" },
  { key: "offer", label: "Offer", status: "Offer" },
  { key: "rejected", label: "Rejected", status: "Rejected" },
];

const state = {
  entries: [],
  activeFilterKey: "all",
  searchText: "",
  companyEditedByHand: false,
  formError: "",
  savedNotice: "",
  savedNoticeTimer: null,
  pendingDeleteId: "",
  pendingDeleteTimer: null,
  highlightId: "",
};

const elements = {
  form: document.getElementById("add-form"),
  linkInput: document.getElementById("link-input"),
  pasteButton: document.getElementById("paste-button"),
  companyInput: document.getElementById("company-input"),
  roleInput: document.getElementById("role-input"),
  referralInput: document.getElementById("referral-input"),
  formMessage: document.getElementById("form-message"),
  weekCount: document.getElementById("week-count"),
  weekBar: document.getElementById("week-bar"),
  weekBarFill: document.getElementById("week-bar-fill"),
  totalCount: document.getElementById("total-count"),
  interviewCount: document.getElementById("interview-count"),
  filters: document.getElementById("filters"),
  searchInput: document.getElementById("search-input"),
  entryList: document.getElementById("entry-list"),
  emptyState: document.getElementById("empty-state"),
  exportJsonButton: document.getElementById("export-json-button"),
  exportCsvButton: document.getElementById("export-csv-button"),
  importButton: document.getElementById("import-button"),
  importInput: document.getElementById("import-input"),
  dataMessage: document.getElementById("data-message"),
};

function toDateKey(date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function getTodayKey() {
  const now = new Date();
  return toDateKey(now);
}

function parseDateKey(dateKey) {
  const parts = dateKey.split("-");
  const year = Number(parts[0]);
  const monthIndex = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  return new Date(year, monthIndex, day);
}

function daysBetween(earlierDateKey, laterDateKey) {
  const earlierDate = parseDateKey(earlierDateKey);
  const laterDate = parseDateKey(laterDateKey);
  const differenceMs = laterDate.getTime() - earlierDate.getTime();
  const differenceDays = differenceMs / MS_PER_DAY;
  return Math.round(differenceDays);
}

function getWeekStartKey(todayKey) {
  const today = parseDateKey(todayKey);
  const dayOfWeek = today.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const mondayDay = today.getDate() - daysSinceMonday;
  const monday = new Date(today.getFullYear(), today.getMonth(), mondayDay);
  return toDateKey(monday);
}

function formatDateLabel(dateKey, todayKey) {
  const daysAgo = daysBetween(dateKey, todayKey);
  if (daysAgo === 0) {
    return "Today";
  }
  if (daysAgo === 1) {
    return "Yesterday";
  }

  const date = parseDateKey(dateKey);
  const today = parseDateKey(todayKey);
  const monthName = MONTH_NAMES[date.getMonth()];
  let label = monthName + " " + date.getDate();
  if (date.getFullYear() !== today.getFullYear()) {
    label = label + ", " + date.getFullYear();
  }
  return label;
}

function buildDateKey(year, month, day) {
  const monthIndex = month - 1;
  const date = new Date(year, monthIndex, day);
  const yearMatches = date.getFullYear() === year;
  const monthMatches = date.getMonth() === monthIndex;
  const dayMatches = date.getDate() === day;
  if (!yearMatches || !monthMatches || !dayMatches) {
    return "";
  }
  return toDateKey(date);
}

function normalizeDateValue(value) {
  const text = cleanText(value);

  const isoMatch = text.match(ISO_DATE_PATTERN);
  if (isoMatch !== null) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return buildDateKey(year, month, day);
  }

  const usMatch = text.match(US_DATE_PATTERN);
  if (usMatch !== null) {
    const year = Number(usMatch[3]);
    const month = Number(usMatch[1]);
    const day = Number(usMatch[2]);
    return buildDateKey(year, month, day);
  }

  return "";
}

function parseTimestamp(value) {
  if (typeof value === "number") {
    if (Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  if (text === "") {
    return null;
  }

  const numericValue = Number(text);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return Math.round(numericValue);
  }

  const parsedTime = Date.parse(text);
  if (Number.isFinite(parsedTime)) {
    return parsedTime;
  }

  return null;
}

function cleanText(value) {
  let text = "";
  if (typeof value === "string") {
    text = value;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    text = String(value);
  } else {
    return "";
  }

  const collapsedText = text.replace(WHITESPACE_PATTERN, " ");
  return collapsedText.trim();
}

function toBoolean(value) {
  if (value === true) {
    return true;
  }
  if (value === 1) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }

  const lowerText = value.trim().toLowerCase();
  return TRUE_WORDS.includes(lowerText);
}

function normalizeStatus(value) {
  const lowerText = cleanText(value).toLowerCase();
  if (lowerText === "waiting") {
    return "Applied";
  }

  for (const status of STATUSES) {
    if (status.toLowerCase() === lowerText) {
      return status;
    }
  }

  return "Applied";
}

function getNextStatus(status) {
  const currentIndex = STATUSES.indexOf(status);
  const nextIndex = (currentIndex + 1) % STATUSES.length;
  return STATUSES[nextIndex];
}

function createId() {
  const canUseRandomUuid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function";
  if (canUseRandomUuid) {
    return crypto.randomUUID();
  }

  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return timePart + "-" + randomPart;
}

function sanitizeEntry(item) {
  if (item === null || typeof item !== "object") {
    return null;
  }

  const company = cleanText(item.company);
  if (company === "") {
    return null;
  }

  const role = cleanText(item.role);
  const link = normalizeLink(cleanText(item.link));
  const referral = toBoolean(item.referral);
  const status = normalizeStatus(item.status);
  const parsedCreatedAt = parseTimestamp(item.createdAt);

  let date = normalizeDateValue(item.date);
  if (date === "" && parsedCreatedAt !== null) {
    const createdDate = new Date(parsedCreatedAt);
    date = toDateKey(createdDate);
  }
  if (date === "") {
    date = getTodayKey();
  }

  let createdAt = parsedCreatedAt;
  if (createdAt === null) {
    const startOfDate = parseDateKey(date);
    createdAt = startOfDate.getTime();
  }

  let id = cleanText(item.id);
  if (id === "") {
    id = createId();
  }

  return {
    id: id,
    company: company,
    role: role,
    link: link,
    referral: referral,
    status: status,
    date: date,
    createdAt: createdAt,
  };
}

function entriesAreEqual(firstEntry, secondEntry) {
  for (const fieldName of ENTRY_FIELDS) {
    if (firstEntry[fieldName] !== secondEntry[fieldName]) {
      return false;
    }
  }
  return true;
}

function loadEntries() {
  let storedText = null;
  try {
    storedText = window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    showDataMessage("This browser is blocking storage, so entries won't be saved.", "error");
    return [];
  }

  if (storedText === null) {
    return [];
  }

  let parsedValue = null;
  try {
    parsedValue = JSON.parse(storedText);
  } catch (error) {
    backUpUnreadableData(storedText);
    return [];
  }

  if (!Array.isArray(parsedValue)) {
    backUpUnreadableData(storedText);
    return [];
  }

  const entries = [];
  for (const item of parsedValue) {
    const entry = sanitizeEntry(item);
    if (entry !== null) {
      entries.push(entry);
    }
  }
  return entries;
}

function backUpUnreadableData(storedText) {
  const backupKey = STORAGE_KEY + ".unreadable." + Date.now();
  try {
    window.localStorage.setItem(backupKey, storedText);
  } catch (error) {
    return;
  }
  showDataMessage("Saved data couldn't be read. A copy was kept under " + backupKey + ".", "error");
}

function saveEntries() {
  const storedText = JSON.stringify(state.entries);
  try {
    window.localStorage.setItem(STORAGE_KEY, storedText);
  } catch (error) {
    showDataMessage("Couldn't save to this browser's storage. Export a backup now.", "error");
  }
}

async function requestPersistentStorage() {
  const storageManager = navigator.storage;
  if (storageManager === undefined) {
    return;
  }
  if (typeof storageManager.persist !== "function") {
    return;
  }

  try {
    await storageManager.persist();
  } catch (error) {
    return;
  }
}

function findEntryIndex(entryId) {
  for (let index = 0; index < state.entries.length; index += 1) {
    if (state.entries[index].id === entryId) {
      return index;
    }
  }
  return -1;
}

function findEntry(entryId) {
  const entryIndex = findEntryIndex(entryId);
  if (entryIndex === -1) {
    return null;
  }
  return state.entries[entryIndex];
}

function findFilter(filterKey) {
  for (const filter of FILTERS) {
    if (filter.key === filterKey) {
      return filter;
    }
  }
  return FILTERS[0];
}

function compareNewestFirst(firstEntry, secondEntry) {
  if (firstEntry.date > secondEntry.date) {
    return -1;
  }
  if (firstEntry.date < secondEntry.date) {
    return 1;
  }
  return secondEntry.createdAt - firstEntry.createdAt;
}

function getSortedEntries() {
  const sortedEntries = state.entries.slice();
  sortedEntries.sort(compareNewestFirst);
  return sortedEntries;
}

function entryMatchesSearch(entry, lowerSearchText) {
  const lowerCompany = entry.company.toLowerCase();
  if (lowerCompany.includes(lowerSearchText)) {
    return true;
  }

  const lowerRole = entry.role.toLowerCase();
  if (lowerRole.includes(lowerSearchText)) {
    return true;
  }

  return false;
}

function getVisibleEntries() {
  const activeFilter = findFilter(state.activeFilterKey);
  const lowerSearchText = state.searchText.trim().toLowerCase();
  const sortedEntries = getSortedEntries();
  const visibleEntries = [];

  for (const entry of sortedEntries) {
    const isFilteredOut = activeFilter.status !== "" && entry.status !== activeFilter.status;
    if (isFilteredOut) {
      continue;
    }

    const isSearchedOut = lowerSearchText !== "" && !entryMatchesSearch(entry, lowerSearchText);
    if (isSearchedOut) {
      continue;
    }

    visibleEntries.push(entry);
  }

  return visibleEntries;
}

function countByFilter() {
  const counts = {};
  for (const filter of FILTERS) {
    counts[filter.key] = 0;
  }

  for (const entry of state.entries) {
    for (const filter of FILTERS) {
      const matchesFilter = filter.status === "" || filter.status === entry.status;
      if (matchesFilter) {
        counts[filter.key] += 1;
      }
    }
  }

  return counts;
}

function normalizeCompanyName(name) {
  const lowerName = name.toLowerCase();
  const lettersAndDigits = lowerName.replace(NON_ALPHANUMERIC_PATTERN, "");
  return lettersAndDigits;
}

function findDuplicateEntries(companyText) {
  const normalizedCompany = normalizeCompanyName(companyText);
  if (normalizedCompany === "") {
    return [];
  }

  const sortedEntries = getSortedEntries();
  const duplicates = [];
  for (const entry of sortedEntries) {
    const normalizedEntryCompany = normalizeCompanyName(entry.company);
    if (normalizedEntryCompany === normalizedCompany) {
      duplicates.push(entry);
    }
  }
  return duplicates;
}

function buildDuplicateWarning(companyText) {
  const duplicates = findDuplicateEntries(companyText);
  if (duplicates.length === 0) {
    return "";
  }

  const todayKey = getTodayKey();
  const shownCount = Math.min(duplicates.length, MAX_DUPLICATES_SHOWN);
  const descriptions = [];
  for (let index = 0; index < shownCount; index += 1) {
    const entry = duplicates[index];
    const dateLabel = formatDateLabel(entry.date, todayKey);
    let description = dateLabel;
    if (entry.role !== "") {
      description = entry.role + " (" + dateLabel + ")";
    }
    descriptions.push(description);
  }

  let warningText = "Already applied here: " + descriptions.join(", ");
  const hiddenCount = duplicates.length - shownCount;
  if (hiddenCount > 0) {
    warningText = warningText + ", +" + hiddenCount + " more";
  }
  return warningText;
}

function getDaysWaiting(entry, todayKey) {
  if (entry.status !== "Applied") {
    return 0;
  }
  return daysBetween(entry.date, todayKey);
}

function renderStats(todayKey) {
  const weekStartKey = getWeekStartKey(todayKey);
  let weekCount = 0;
  let interviewCount = 0;

  for (const entry of state.entries) {
    const isThisWeek = entry.date >= weekStartKey && entry.date <= todayKey;
    if (isThisWeek) {
      weekCount += 1;
    }

    const isInterviewStage = entry.status === "Interviewing" || entry.status === "Offer";
    if (isInterviewStage) {
      interviewCount += 1;
    }
  }

  const weekRatio = weekCount / WEEKLY_GOAL;
  const weekPercent = Math.min(100, weekRatio * 100);
  const goalIsMet = weekCount >= WEEKLY_GOAL;

  elements.weekCount.textContent = weekCount + " / " + WEEKLY_GOAL;
  elements.weekBarFill.style.width = weekPercent + "%";
  elements.weekBar.setAttribute("aria-valuenow", String(Math.min(weekCount, WEEKLY_GOAL)));
  elements.weekBar.setAttribute("aria-valuemax", String(WEEKLY_GOAL));
  elements.weekBar.classList.toggle("is-complete", goalIsMet);
  elements.totalCount.textContent = String(state.entries.length);
  elements.interviewCount.textContent = String(interviewCount);
}

function buildFilterChips() {
  for (const filter of FILTERS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.filterKey = filter.key;

    const label = document.createElement("span");
    label.textContent = filter.label;
    chip.appendChild(label);

    const count = document.createElement("span");
    count.className = "chip-count";
    count.textContent = "0";
    chip.appendChild(count);

    elements.filters.appendChild(chip);
  }
}

function renderFilterChips() {
  const counts = countByFilter();
  const chips = elements.filters.querySelectorAll(".chip");
  for (const chip of chips) {
    const filterKey = chip.dataset.filterKey;
    const countElement = chip.querySelector(".chip-count");
    countElement.textContent = String(counts[filterKey]);

    const isActive = filterKey === state.activeFilterKey;
    chip.setAttribute("aria-pressed", String(isActive));
  }
}

function createTag(text, variant) {
  const tag = document.createElement("span");
  tag.className = "tag tag-" + variant;
  tag.textContent = text;
  return tag;
}

function createDeleteIcon() {
  const icon = document.createElementNS(SVG_NAMESPACE, "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("width", "14");
  icon.setAttribute("height", "14");
  icon.setAttribute("aria-hidden", "true");

  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", "M4 4l8 8M12 4l-8 8");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.75");
  path.setAttribute("stroke-linecap", "round");
  icon.appendChild(path);

  return icon;
}

function applyDeleteButtonState(button, entry, isPending) {
  button.replaceChildren();
  if (isPending) {
    button.textContent = "Sure?";
    button.classList.add("is-pending");
    button.setAttribute("aria-label", "Confirm delete " + entry.company);
    return;
  }

  button.appendChild(createDeleteIcon());
  button.classList.remove("is-pending");
  button.setAttribute("aria-label", "Delete " + entry.company);
}

function createCompanyCell(entry) {
  const cell = document.createElement("div");
  cell.className = "entry-company";

  if (entry.link === "") {
    const name = document.createElement("span");
    name.textContent = entry.company;
    cell.appendChild(name);
    return cell;
  }

  const link = document.createElement("a");
  link.href = entry.link;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = entry.link;
  link.textContent = entry.company;
  cell.appendChild(link);
  return cell;
}

function createDetailsCell(entry, todayKey) {
  const cell = document.createElement("div");
  cell.className = "entry-details";

  if (entry.role !== "") {
    const role = document.createElement("span");
    role.className = "entry-role";
    role.title = entry.role;
    role.textContent = entry.role;
    cell.appendChild(role);
  }

  const tags = [];
  if (entry.referral) {
    const referralTag = createTag("Referral", "referral");
    tags.push(referralTag);
  }

  const daysWaiting = getDaysWaiting(entry, todayKey);
  if (daysWaiting >= FOLLOW_UP_AFTER_DAYS) {
    const followUpTag = createTag("No reply in " + daysWaiting + " days", "follow-up");
    tags.push(followUpTag);
  }

  if (tags.length > 0) {
    const tagGroup = document.createElement("span");
    tagGroup.className = "entry-tags";
    tagGroup.replaceChildren(...tags);
    cell.appendChild(tagGroup);
  }

  return cell;
}

function createDateCell(entry, todayKey) {
  const cell = document.createElement("div");
  cell.className = "entry-date";

  const time = document.createElement("time");
  time.dateTime = entry.date;
  time.textContent = formatDateLabel(entry.date, todayKey);
  cell.appendChild(time);
  return cell;
}

function createStatusCell(entry) {
  const cell = document.createElement("div");
  cell.className = "entry-status";

  const nextStatus = getNextStatus(entry.status);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "status-pill";
  button.dataset.action = "cycle-status";
  button.dataset.status = entry.status.toLowerCase();
  button.title = "Change to " + nextStatus;
  button.setAttribute("aria-label", "Status " + entry.status + ". Change to " + nextStatus);
  button.textContent = entry.status;
  cell.appendChild(button);
  return cell;
}

function createDeleteCell(entry) {
  const cell = document.createElement("div");
  cell.className = "entry-delete";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "delete-button";
  button.dataset.action = "delete";
  const isPending = entry.id === state.pendingDeleteId;
  applyDeleteButtonState(button, entry, isPending);
  cell.appendChild(button);
  return cell;
}

function createEntryRow(entry, todayKey) {
  const row = document.createElement("li");
  row.className = "entry";
  row.dataset.id = entry.id;
  if (entry.id === state.highlightId) {
    row.classList.add("is-new");
  }

  row.appendChild(createCompanyCell(entry));
  row.appendChild(createDetailsCell(entry, todayKey));
  row.appendChild(createDateCell(entry, todayKey));
  row.appendChild(createStatusCell(entry));
  row.appendChild(createDeleteCell(entry));
  return row;
}

function renderEmptyState(visibleCount) {
  if (visibleCount > 0) {
    elements.emptyState.hidden = true;
    elements.entryList.hidden = false;
    return;
  }

  elements.entryList.hidden = true;
  elements.emptyState.hidden = false;

  const trimmedSearch = state.searchText.trim();
  if (state.entries.length === 0) {
    elements.emptyState.textContent = "No applications yet. Paste a job link above and press Enter.";
  } else if (trimmedSearch !== "") {
    elements.emptyState.textContent = "No matches for “" + trimmedSearch + "”.";
  } else {
    const activeFilter = findFilter(state.activeFilterKey);
    elements.emptyState.textContent = "Nothing under " + activeFilter.label + " yet.";
  }
}

function renderEntryList(todayKey) {
  const visibleEntries = getVisibleEntries();
  const rows = [];
  for (const entry of visibleEntries) {
    const row = createEntryRow(entry, todayKey);
    rows.push(row);
  }
  elements.entryList.replaceChildren(...rows);
  renderEmptyState(visibleEntries.length);
}

function renderFormMessage() {
  let messageText = "";
  let tone = "";

  if (state.formError !== "") {
    messageText = state.formError;
    tone = "error";
  } else {
    const duplicateWarning = buildDuplicateWarning(elements.companyInput.value);
    if (duplicateWarning !== "") {
      messageText = duplicateWarning;
      tone = "warning";
    } else if (state.savedNotice !== "") {
      messageText = state.savedNotice;
      tone = "success";
    }
  }

  elements.formMessage.textContent = messageText;
  elements.formMessage.dataset.tone = tone;
}

function render() {
  const todayKey = getTodayKey();
  renderStats(todayKey);
  renderFilterChips();
  renderEntryList(todayKey);
  renderFormMessage();
}

function showDataMessage(text, tone) {
  elements.dataMessage.textContent = text;
  elements.dataMessage.dataset.tone = tone;
}

function clearSavedNotice() {
  if (state.savedNoticeTimer !== null) {
    window.clearTimeout(state.savedNoticeTimer);
    state.savedNoticeTimer = null;
  }
  state.savedNotice = "";
}

function handleSavedNoticeTimeout() {
  state.savedNoticeTimer = null;
  state.savedNotice = "";
  renderFormMessage();
}

function showSavedNotice(entry) {
  clearSavedNotice();
  let noticeText = "Saved " + entry.company;
  if (entry.role !== "") {
    noticeText = noticeText + " · " + entry.role;
  }
  state.savedNotice = noticeText;
  state.savedNoticeTimer = window.setTimeout(handleSavedNoticeTimeout, SAVED_NOTICE_MS);
}

function applyCompanyGuess() {
  if (state.companyEditedByHand) {
    return;
  }
  const guessedCompany = companyFromUrl(elements.linkInput.value);
  elements.companyInput.value = guessedCompany;
}

function clearForm() {
  elements.linkInput.value = "";
  elements.companyInput.value = "";
  elements.roleInput.value = "";
  elements.referralInput.checked = false;
  state.companyEditedByHand = false;
  state.formError = "";
}

function addEntryFromForm() {
  const companyText = cleanText(elements.companyInput.value);
  if (companyText === "") {
    state.formError = "Add a company name to save.";
    renderFormMessage();
    elements.companyInput.focus();
    return;
  }

  const roleText = cleanText(elements.roleInput.value);
  const linkText = normalizeLink(elements.linkInput.value);
  const isReferral = elements.referralInput.checked;
  const now = new Date();

  const entry = {
    id: createId(),
    company: companyText,
    role: roleText,
    link: linkText,
    referral: isReferral,
    status: "Applied",
    date: toDateKey(now),
    createdAt: now.getTime(),
  };

  state.entries.push(entry);
  saveEntries();

  showSavedNotice(entry);
  clearForm();
  state.highlightId = entry.id;
  render();
  state.highlightId = "";
  elements.linkInput.focus();
}

function handleFormSubmit(event) {
  event.preventDefault();
  addEntryFromForm();
}

function handleFormKeydown(event) {
  if (event.key !== "Enter") {
    return;
  }
  if (event.target !== elements.referralInput) {
    return;
  }
  event.preventDefault();
  elements.form.requestSubmit();
}

function handleFormInput() {
  state.formError = "";
  clearSavedNotice();
  renderFormMessage();
}

function handleLinkInput() {
  applyCompanyGuess();
}

function handleCompanyInput() {
  const trimmedCompany = elements.companyInput.value.trim();
  if (trimmedCompany === "") {
    state.companyEditedByHand = false;
  } else {
    state.companyEditedByHand = true;
  }
}

async function handlePasteClick() {
  let clipboardText = "";
  try {
    clipboardText = await navigator.clipboard.readText();
  } catch (error) {
    state.formError = "Couldn't read the clipboard. Paste into the link field instead.";
    renderFormMessage();
    elements.linkInput.focus();
    return;
  }

  let pastedValue = clipboardText.trim();
  const normalizedLink = normalizeLink(clipboardText);
  if (normalizedLink !== "") {
    pastedValue = normalizedLink;
  }

  elements.linkInput.value = pastedValue;
  state.formError = "";
  clearSavedNotice();
  applyCompanyGuess();
  renderFormMessage();

  const companyIsBlank = elements.companyInput.value.trim() === "";
  if (companyIsBlank) {
    elements.companyInput.focus();
  }
}

function setUpPasteButton() {
  const clipboard = navigator.clipboard;
  const canReadClipboard = clipboard !== undefined && typeof clipboard.readText === "function";
  if (!canReadClipboard) {
    elements.pasteButton.hidden = true;
    return;
  }
  elements.pasteButton.addEventListener("click", handlePasteClick);
}

function handleFilterClick(event) {
  const chip = event.target.closest(".chip");
  if (chip === null) {
    return;
  }
  state.activeFilterKey = chip.dataset.filterKey;
  render();
}

function handleSearchInput() {
  state.searchText = elements.searchInput.value;
  renderEntryList(getTodayKey());
}

function handleSearchKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }
  if (elements.searchInput.value === "") {
    return;
  }
  event.preventDefault();
  elements.searchInput.value = "";
  state.searchText = "";
  renderEntryList(getTodayKey());
}

function findRowControl(entryId, action) {
  const escapedId = CSS.escape(entryId);
  const selector = '[data-id="' + escapedId + '"] [data-action="' + action + '"]';
  return elements.entryList.querySelector(selector);
}

function cycleStatus(entryId) {
  const entry = findEntry(entryId);
  if (entry === null) {
    return;
  }

  entry.status = getNextStatus(entry.status);
  saveEntries();
  render();

  const statusButton = findRowControl(entryId, "cycle-status");
  if (statusButton !== null) {
    statusButton.focus({ preventScroll: true });
  }
}

function clearPendingDelete() {
  if (state.pendingDeleteTimer !== null) {
    window.clearTimeout(state.pendingDeleteTimer);
    state.pendingDeleteTimer = null;
  }

  const previousId = state.pendingDeleteId;
  state.pendingDeleteId = "";
  if (previousId === "") {
    return;
  }

  const previousEntry = findEntry(previousId);
  const previousButton = findRowControl(previousId, "delete");
  if (previousEntry !== null && previousButton !== null) {
    applyDeleteButtonState(previousButton, previousEntry, false);
  }
}

function handlePendingDeleteTimeout() {
  state.pendingDeleteTimer = null;
  clearPendingDelete();
}

function deleteEntry(entryId) {
  const entryIndex = findEntryIndex(entryId);
  if (entryIndex === -1) {
    return;
  }

  state.entries.splice(entryIndex, 1);
  saveEntries();
  render();
}

function handleDeleteClick(entryId, button) {
  const isConfirming = state.pendingDeleteId === entryId;
  if (isConfirming) {
    clearPendingDelete();
    deleteEntry(entryId);
    return;
  }

  clearPendingDelete();

  const entry = findEntry(entryId);
  if (entry === null) {
    return;
  }

  state.pendingDeleteId = entryId;
  applyDeleteButtonState(button, entry, true);
  state.pendingDeleteTimer = window.setTimeout(handlePendingDeleteTimeout, DELETE_CONFIRM_MS);
}

function handleEntryListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (button === null) {
    return;
  }

  const row = button.closest(".entry");
  if (row === null) {
    return;
  }

  const entryId = row.dataset.id;
  const action = button.dataset.action;
  if (action === "cycle-status") {
    cycleStatus(entryId);
    return;
  }
  if (action === "delete") {
    handleDeleteClick(entryId, button);
  }
}

function escapeCsvCell(text) {
  const needsQuotes = CSV_SPECIAL_CHARACTER_PATTERN.test(text);
  if (!needsQuotes) {
    return text;
  }
  const escapedText = text.replace(/"/g, '""');
  return '"' + escapedText + '"';
}

function entriesToCsv(entries) {
  const lines = [];
  lines.push(ENTRY_FIELDS.join(","));

  for (const entry of entries) {
    const cells = [];
    for (const fieldName of ENTRY_FIELDS) {
      const cellText = String(entry[fieldName]);
      cells.push(escapeCsvCell(cellText));
    }
    lines.push(cells.join(","));
  }

  const csvBody = lines.join("\r\n");
  return BYTE_ORDER_MARK + csvBody + "\r\n";
}

function parseCsvRows(text) {
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let insideQuotes = false;
  let index = 0;

  while (index < text.length) {
    const character = text[index];

    if (insideQuotes) {
      if (character === '"') {
        const nextCharacter = text[index + 1];
        if (nextCharacter === '"') {
          currentField = currentField + '"';
          index += 2;
          continue;
        }
        insideQuotes = false;
        index += 1;
        continue;
      }
      currentField = currentField + character;
      index += 1;
      continue;
    }

    if (character === '"') {
      insideQuotes = true;
    } else if (character === ",") {
      currentRow.push(currentField);
      currentField = "";
    } else if (character === "\n") {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = "";
    } else if (character !== "\r") {
      currentField = currentField + character;
    }
    index += 1;
  }

  const hasTrailingContent = currentField !== "" || currentRow.length > 0;
  if (hasTrailingContent) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

function matchEntryField(headerText) {
  const lowerHeader = cleanText(headerText).toLowerCase();
  for (const fieldName of ENTRY_FIELDS) {
    if (fieldName.toLowerCase() === lowerHeader) {
      return fieldName;
    }
  }
  return "";
}

function isBlankRow(row) {
  for (const cell of row) {
    if (cell.trim() !== "") {
      return false;
    }
  }
  return true;
}

function parseCsvItems(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    return null;
  }

  const headerRow = rows[0];
  const fieldNames = [];
  for (const headerText of headerRow) {
    fieldNames.push(matchEntryField(headerText));
  }
  if (!fieldNames.includes("company")) {
    return null;
  }

  const items = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (isBlankRow(row)) {
      continue;
    }

    const item = {};
    for (let columnIndex = 0; columnIndex < fieldNames.length; columnIndex += 1) {
      const fieldName = fieldNames[columnIndex];
      if (fieldName === "") {
        continue;
      }
      const cellValue = row[columnIndex];
      if (cellValue === undefined) {
        continue;
      }
      item[fieldName] = cellValue;
    }
    items.push(item);
  }

  return items;
}

function parseJsonItems(text) {
  let parsedValue = null;
  try {
    parsedValue = JSON.parse(text);
  } catch (error) {
    return null;
  }

  if (Array.isArray(parsedValue)) {
    return parsedValue;
  }

  const isObject = parsedValue !== null && typeof parsedValue === "object";
  if (isObject && Array.isArray(parsedValue.entries)) {
    return parsedValue.entries;
  }

  return null;
}

function parseImportText(text, fileName) {
  let cleanedText = text;
  if (cleanedText.startsWith(BYTE_ORDER_MARK)) {
    cleanedText = cleanedText.slice(1);
  }

  const trimmedText = cleanedText.trim();
  if (trimmedText === "") {
    return null;
  }

  const lowerFileName = fileName.toLowerCase();
  const startsLikeJson = trimmedText.startsWith("[") || trimmedText.startsWith("{");
  const namedLikeJson = lowerFileName.endsWith(".json");
  if (startsLikeJson || namedLikeJson) {
    return parseJsonItems(trimmedText);
  }

  return parseCsvItems(cleanedText);
}

function mergeImportedEntries(importedEntries) {
  const result = { added: 0, updated: 0, unchanged: 0 };

  for (const importedEntry of importedEntries) {
    const existingIndex = findEntryIndex(importedEntry.id);
    if (existingIndex === -1) {
      state.entries.push(importedEntry);
      result.added += 1;
      continue;
    }

    const existingEntry = state.entries[existingIndex];
    if (entriesAreEqual(existingEntry, importedEntry)) {
      result.unchanged += 1;
      continue;
    }

    state.entries[existingIndex] = importedEntry;
    result.updated += 1;
  }

  return result;
}

function downloadTextFile(fileName, text, mimeType) {
  const blob = new Blob([text], { type: mimeType + ";charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(function () {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

function describeCount(count) {
  if (count === 1) {
    return "1 entry";
  }
  return count + " entries";
}

function exportJson() {
  if (state.entries.length === 0) {
    showDataMessage("Nothing to export yet.", "");
    return;
  }

  const sortedEntries = getSortedEntries();
  const jsonText = JSON.stringify(sortedEntries, null, 2);
  const fileName = "applications-" + getTodayKey() + ".json";
  downloadTextFile(fileName, jsonText, "application/json");
  showDataMessage("Exported " + describeCount(sortedEntries.length) + " as JSON.", "success");
}

function exportCsv() {
  if (state.entries.length === 0) {
    showDataMessage("Nothing to export yet.", "");
    return;
  }

  const sortedEntries = getSortedEntries();
  const csvText = entriesToCsv(sortedEntries);
  const fileName = "applications-" + getTodayKey() + ".csv";
  downloadTextFile(fileName, csvText, "text/csv");
  showDataMessage("Exported " + describeCount(sortedEntries.length) + " as CSV.", "success");
}

function openImportPicker() {
  elements.importInput.click();
}

async function handleImportChange() {
  const files = elements.importInput.files;
  if (files === null || files.length === 0) {
    return;
  }

  const file = files[0];
  elements.importInput.value = "";

  let fileText = "";
  try {
    fileText = await file.text();
  } catch (error) {
    showDataMessage("Couldn't read " + file.name + ".", "error");
    return;
  }

  const items = parseImportText(fileText, file.name);
  if (items === null) {
    showDataMessage(file.name + " isn't a tracker export (JSON or CSV with a company column).", "error");
    return;
  }

  const importedEntries = [];
  let skippedCount = 0;
  for (const item of items) {
    const entry = sanitizeEntry(item);
    if (entry === null) {
      skippedCount += 1;
    } else {
      importedEntries.push(entry);
    }
  }

  if (importedEntries.length === 0) {
    showDataMessage("No entries found in " + file.name + ".", "error");
    return;
  }

  clearPendingDelete();
  const result = mergeImportedEntries(importedEntries);
  saveEntries();
  render();

  let summary = "Imported " + file.name + ": " + result.added + " new, " + result.updated + " updated, " + result.unchanged + " unchanged.";
  if (skippedCount > 0) {
    summary = summary + " Skipped " + skippedCount + " without a company.";
  }
  showDataMessage(summary, "success");
}

function handleStorageEvent(event) {
  if (event.key !== STORAGE_KEY) {
    return;
  }
  state.entries = loadEntries();
  render();
}

function handleVisibilityChange() {
  if (document.visibilityState !== "visible") {
    return;
  }
  render();
}

function attachEventListeners() {
  elements.form.addEventListener("submit", handleFormSubmit);
  elements.form.addEventListener("keydown", handleFormKeydown);
  elements.form.addEventListener("input", handleFormInput);
  elements.linkInput.addEventListener("input", handleLinkInput);
  elements.companyInput.addEventListener("input", handleCompanyInput);
  elements.filters.addEventListener("click", handleFilterClick);
  elements.searchInput.addEventListener("input", handleSearchInput);
  elements.searchInput.addEventListener("keydown", handleSearchKeydown);
  elements.entryList.addEventListener("click", handleEntryListClick);
  elements.exportJsonButton.addEventListener("click", exportJson);
  elements.exportCsvButton.addEventListener("click", exportCsv);
  elements.importButton.addEventListener("click", openImportPicker);
  elements.importInput.addEventListener("change", handleImportChange);
  window.addEventListener("storage", handleStorageEvent);
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function start() {
  state.entries = loadEntries();
  buildFilterChips();
  setUpPasteButton();
  attachEventListeners();
  render();
  requestPersistentStorage();
}

start();
