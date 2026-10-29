import { test } from "node:test";
import assert from "node:assert/strict";
import { companyFromUrl, normalizeLink, slugToName } from "../company-from-url.js";

const BOARD_CASES = [
  ["https://boards.greenhouse.io/stripe/jobs/123456", "Stripe"],
  ["https://job-boards.greenhouse.io/anthropic/jobs/4020305008", "Anthropic"],
  ["https://job-boards.eu.greenhouse.io/deepl/jobs/1", "Deepl"],
  ["https://boards.greenhouse.io/embed/job_app?for=figma&token=123", "Figma"],
  ["https://jobs.lever.co/scale-ai/abc-123/apply", "Scale Ai"],
  ["https://jobs.ashbyhq.com/openai/1a2b3c", "Openai"],
  ["https://jobs.ashbyhq.com/Cohere/1a2b3c", "Cohere"],
  ["https://jobs.smartrecruiters.com/Visa/744000012345", "Visa"],
  ["https://apply.workable.com/huggingface/j/ABC123/", "Huggingface"],
  ["https://acme.workable.com/jobs/123", "Acme"],
  ["https://acme.recruitee.com/o/ml-engineer", "Acme"],
  ["https://jobs.jobvite.com/nutanix/job/o1abc", "Nutanix"],
  ["https://acme-labs.breezy.hr/p/123-ml-engineer", "Acme Labs"],
];

const WORKDAY_CASES = [
  ["https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA-Santa-Clara/Engineer_JR1", "Nvidia"],
  ["https://salesforce.wd12.myworkdayjobs.com/External_Career_Site/job/1", "Salesforce"],
  ["https://intel.wd1.myworkdayjobs.com/External", "Intel"],
  ["https://wd3.myworkdaysite.com/en-US/recruiting/sanofi/SanofiCareers/job/1", "Sanofi"],
];

const SUBDOMAIN_CASES = [
  ["https://acme.bamboohr.com/careers/12", "Acme"],
  ["https://acme.teamtailor.com/jobs/1-engineer", "Acme"],
  ["https://careers-nvidia.icims.com/jobs/1234/job", "Nvidia"],
  ["https://uscareers-acme.icims.com/jobs/1/job", "Acme"],
];

const CAREER_SITE_CASES = [
  ["https://careers.google.com/jobs/results/123", "Google"],
  ["https://www.amazon.jobs/en/jobs/2700000/sde", "Amazon"],
  ["https://amazon.jobs/en/jobs/2700000/sde", "Amazon"],
  ["https://careers.intel.com/job/1", "Intel"],
  ["https://jobs.apple.com/en-us/details/200000000", "Apple"],
  ["https://www.metacareers.com/jobs/123/", "Meta"],
  ["https://explore.jobs.netflix.net/careers/job/790000000", "Netflix"],
  ["https://careers.tesco.co.uk/jobs/1", "Tesco"],
  ["https://openai.com/careers/research-engineer", "Openai"],
];

const AGGREGATOR_CASES = [
  "https://www.linkedin.com/jobs/view/4012345678",
  "https://lnkd.in/abc123",
  "https://www.indeed.com/viewjob?jk=abc",
  "https://uk.indeed.com/viewjob?jk=abc",
  "https://app.joinhandshake.com/jobs/123",
  "https://www.glassdoor.com/job-listing/ml-engineer-acme-JV_IC1.htm",
  "https://www.glassdoor.co.uk/job-listing/x.htm",
  "https://simplify.jobs/p/123/ml-engineer",
  "https://github.com/SimplifyJobs/New-Grad-Positions",
];

const BLANK_CASES = [
  "",
  "   ",
  "not a url",
  "localhost",
  "https://jobs.lever.co/",
  "https://boards.greenhouse.io/embed/job_app",
  "https://www.bamboohr.com/careers",
  "https://jobs.workable.com/view/abc/ml-engineer",
];

function checkCases(cases) {
  for (const testCase of cases) {
    const input = testCase[0];
    const expected = testCase[1];
    const actual = companyFromUrl(input);
    assert.equal(actual, expected, input);
  }
}

test("path-based job boards use the first path segment", function () {
  checkCases(BOARD_CASES);
});

test("Workday hosts use the subdomain for any wd number", function () {
  checkCases(WORKDAY_CASES);
});

test("subdomain job boards use the subdomain", function () {
  checkCases(SUBDOMAIN_CASES);
});

test("company career sites use the main domain name", function () {
  checkCases(CAREER_SITE_CASES);
});

test("aggregators leave the company blank", function () {
  for (const input of AGGREGATOR_CASES) {
    const actual = companyFromUrl(input);
    assert.equal(actual, "", input);
  }
});

test("unusable input or a board with no company gives a blank", function () {
  for (const input of BLANK_CASES) {
    const actual = companyFromUrl(input);
    assert.equal(actual, "", input);
  }
});

test("links without a protocol still work", function () {
  const actual = companyFromUrl("jobs.lever.co/scale-ai/123");
  assert.equal(actual, "Scale Ai");
});

test("a link inside pasted text is found", function () {
  const actual = companyFromUrl("Apply here: https://jobs.lever.co/acme/123. Thanks!");
  assert.equal(actual, "Acme");
});

test("slugs become readable names", function () {
  assert.equal(slugToName("scale-ai"), "Scale Ai");
  assert.equal(slugToName("open_ai"), "Open Ai");
  assert.equal(slugToName("OpenAI"), "OpenAI");
  assert.equal(slugToName(""), "");
});

test("links are normalized and unsafe links are dropped", function () {
  assert.equal(normalizeLink("jobs.lever.co/acme/1"), "https://jobs.lever.co/acme/1");
  assert.equal(normalizeLink("https://example.com/job?id=1"), "https://example.com/job?id=1");
  assert.equal(normalizeLink("javascript:alert(1)"), "");
  assert.equal(normalizeLink("ftp://example.com/file"), "");
  assert.equal(normalizeLink(""), "");
});
