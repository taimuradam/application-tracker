const AGGREGATOR_NAMES = [
  "linkedin",
  "lnkd",
  "indeed",
  "joinhandshake",
  "glassdoor",
  "simplify",
  "github",
];

const CAREER_WORDS = [
  "www",
  "www2",
  "careers",
  "career",
  "jobs",
  "job",
  "apply",
  "uscareers",
];

const PATH_BOARD_HOSTS = [
  "boards.greenhouse.io",
  "boards.eu.greenhouse.io",
  "job-boards.greenhouse.io",
  "job-boards.eu.greenhouse.io",
  "jobs.lever.co",
  "jobs.eu.lever.co",
  "jobs.ashbyhq.com",
  "jobs.smartrecruiters.com",
  "careers.smartrecruiters.com",
  "apply.workable.com",
  "jobs.jobvite.com",
];

const SUBDOMAIN_BOARD_DOMAINS = [
  "bamboohr.com",
  "teamtailor.com",
  "icims.com",
  "recruitee.com",
  "breezy.hr",
  "workable.com",
  "jobvite.com",
];

const RESERVED_SUBDOMAINS = [
  "www",
  "app",
  "api",
  "apply",
  "jobs",
  "careers",
  "help",
  "support",
];

const KNOWN_BOARD_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "smartrecruiters.com",
  "workable.com",
  "recruitee.com",
  "jobvite.com",
  "breezy.hr",
  "myworkdayjobs.com",
  "myworkdaysite.com",
  "bamboohr.com",
  "teamtailor.com",
  "icims.com",
];

const SECOND_LEVEL_SUFFIXES = [
  "co",
  "com",
  "org",
  "net",
  "ac",
  "gov",
  "edu",
  "ne",
  "or",
];

const WORKDAY_COMPANY_HOST_PATTERN = /^([a-z0-9-]+)\.wd\d+\.(myworkdayjobs|myworkdaysite)\.com$/;
const WORKDAY_SHARED_HOST_PATTERN = /^wd\d+\.myworkdaysite\.com$/;
const URL_IN_TEXT_PATTERN = /https?:\/\/[^\s<>"']+/i;
const TRAILING_PUNCTUATION_PATTERN = /[.,;:!?)\]}]+$/;
const PROTOCOL_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
const SLUG_SEPARATOR_PATTERN = /[-_.+]+/g;
const WHITESPACE_PATTERN = /\s+/g;

export function companyFromUrl(rawText) {
  const url = parseUrl(rawText);
  if (url === null) {
    return "";
  }

  const boardSlug = findBoardSlug(url);
  if (boardSlug !== null) {
    return slugToName(boardSlug);
  }

  const host = url.hostname;
  if (isAggregatorHost(host)) {
    return "";
  }

  return companyFromCareerSite(host);
}

export function normalizeLink(rawText) {
  const url = parseUrl(rawText);
  if (url === null) {
    return "";
  }
  return url.href;
}

export function slugToName(slug) {
  if (typeof slug !== "string") {
    return "";
  }

  const spacedText = slug.replace(SLUG_SEPARATOR_PATTERN, " ");
  const collapsedText = spacedText.replace(WHITESPACE_PATTERN, " ");
  const trimmedText = collapsedText.trim();
  if (trimmedText === "") {
    return "";
  }

  const words = trimmedText.split(" ");
  const capitalizedWords = [];
  for (const word of words) {
    const firstCharacter = word.charAt(0).toUpperCase();
    const remainingCharacters = word.slice(1);
    capitalizedWords.push(firstCharacter + remainingCharacters);
  }
  return capitalizedWords.join(" ");
}

function parseUrl(rawText) {
  const urlText = extractUrlText(rawText);
  if (urlText === "") {
    return null;
  }

  let candidateText = urlText;
  const hasProtocol = PROTOCOL_PATTERN.test(candidateText);
  if (!hasProtocol) {
    candidateText = "https://" + candidateText;
  }

  let url = null;
  try {
    url = new URL(candidateText);
  } catch (error) {
    return null;
  }

  const isWebProtocol = url.protocol === "http:" || url.protocol === "https:";
  if (!isWebProtocol) {
    return null;
  }

  const hostHasDot = url.hostname.includes(".");
  if (!hostHasDot) {
    return null;
  }

  return url;
}

function extractUrlText(rawText) {
  if (typeof rawText !== "string") {
    return "";
  }

  const trimmedText = rawText.trim();
  const match = trimmedText.match(URL_IN_TEXT_PATTERN);
  if (match === null) {
    return trimmedText;
  }

  const matchedText = match[0];
  const cleanedText = matchedText.replace(TRAILING_PUNCTUATION_PATTERN, "");
  return cleanedText;
}

function findBoardSlug(url) {
  const host = url.hostname;
  const segments = getPathSegments(url);

  if (PATH_BOARD_HOSTS.includes(host)) {
    return getPathBoardSlug(url, segments);
  }

  const workdayMatch = host.match(WORKDAY_COMPANY_HOST_PATTERN);
  if (workdayMatch !== null) {
    return workdayMatch[1];
  }

  if (WORKDAY_SHARED_HOST_PATTERN.test(host)) {
    return getSegmentAfter(segments, "recruiting");
  }

  const subdomainSlug = getSubdomainBoardSlug(host);
  if (subdomainSlug !== null) {
    return subdomainSlug;
  }

  if (isKnownBoardHost(host)) {
    return "";
  }

  return null;
}

function getPathBoardSlug(url, segments) {
  if (segments.length === 0) {
    return "";
  }

  const firstSegment = segments[0];
  if (firstSegment === "embed") {
    const companyParameter = url.searchParams.get("for");
    if (companyParameter === null) {
      return "";
    }
    return companyParameter;
  }

  return firstSegment;
}

function getSegmentAfter(segments, marker) {
  const markerIndex = segments.indexOf(marker);
  if (markerIndex === -1) {
    return "";
  }

  const nextIndex = markerIndex + 1;
  if (nextIndex >= segments.length) {
    return "";
  }

  return segments[nextIndex];
}

function getSubdomainBoardSlug(host) {
  for (const domain of SUBDOMAIN_BOARD_DOMAINS) {
    const domainSuffix = "." + domain;
    if (!host.endsWith(domainSuffix)) {
      continue;
    }

    const subdomainLength = host.length - domainSuffix.length;
    const subdomainText = host.slice(0, subdomainLength);
    const subdomainLabels = subdomainText.split(".");
    const closestLabel = subdomainLabels[subdomainLabels.length - 1];

    if (RESERVED_SUBDOMAINS.includes(closestLabel)) {
      return "";
    }

    return removeCareerWords(closestLabel);
  }

  return null;
}

function isKnownBoardHost(host) {
  for (const domain of KNOWN_BOARD_DOMAINS) {
    const isExactMatch = host === domain;
    const isSubdomainMatch = host.endsWith("." + domain);
    if (isExactMatch || isSubdomainMatch) {
      return true;
    }
  }
  return false;
}

function isAggregatorHost(host) {
  const nameLabels = getNameLabels(host);
  if (nameLabels.length === 0) {
    return false;
  }

  const mainLabel = nameLabels[nameLabels.length - 1];
  return AGGREGATOR_NAMES.includes(mainLabel);
}

function companyFromCareerSite(host) {
  const nameLabels = getNameLabels(host);
  const keptLabels = [];
  for (const label of nameLabels) {
    if (CAREER_WORDS.includes(label)) {
      continue;
    }
    keptLabels.push(label);
  }

  if (keptLabels.length === 0) {
    return "";
  }

  const mainLabel = keptLabels[keptLabels.length - 1];
  const cleanedLabel = removeCareerWords(mainLabel);
  return slugToName(cleanedLabel);
}

function removeCareerWords(slug) {
  const tokens = slug.split("-");
  const keptTokens = [];
  for (const token of tokens) {
    if (token === "") {
      continue;
    }

    const lowerToken = token.toLowerCase();
    if (CAREER_WORDS.includes(lowerToken)) {
      continue;
    }

    const tokenWithoutSuffix = removeCareersSuffix(token);
    keptTokens.push(tokenWithoutSuffix);
  }

  if (keptTokens.length === 0) {
    return slug;
  }

  return keptTokens.join("-");
}

function removeCareersSuffix(token) {
  const suffix = "careers";
  const lowerToken = token.toLowerCase();
  if (!lowerToken.endsWith(suffix)) {
    return token;
  }

  const remainingLength = token.length - suffix.length;
  if (remainingLength < 2) {
    return token;
  }

  return token.slice(0, remainingLength);
}

function getNameLabels(host) {
  const labels = getHostLabels(host);
  const suffixLength = getPublicSuffixLength(labels);
  const nameLabelCount = labels.length - suffixLength;
  if (nameLabelCount <= 0) {
    return [];
  }
  return labels.slice(0, nameLabelCount);
}

function getHostLabels(host) {
  const rawLabels = host.split(".");
  const labels = [];
  for (const label of rawLabels) {
    if (label === "") {
      continue;
    }
    labels.push(label);
  }
  return labels;
}

function getPublicSuffixLength(labels) {
  if (labels.length < 3) {
    return 1;
  }

  const lastLabel = labels[labels.length - 1];
  const secondLastLabel = labels[labels.length - 2];
  const isCountryCode = lastLabel.length === 2;
  const isGenericSecondLevel = SECOND_LEVEL_SUFFIXES.includes(secondLastLabel);
  if (isCountryCode && isGenericSecondLevel) {
    return 2;
  }

  return 1;
}

function getPathSegments(url) {
  const rawSegments = url.pathname.split("/");
  const segments = [];
  for (const rawSegment of rawSegments) {
    if (rawSegment === "") {
      continue;
    }
    const decodedSegment = safeDecode(rawSegment);
    segments.push(decodedSegment);
  }
  return segments;
}

function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch (error) {
    return text;
  }
}
