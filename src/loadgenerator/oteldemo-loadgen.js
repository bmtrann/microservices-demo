
import http from 'k6/http';
import { check, group } from 'k6';
import { SharedArray } from 'k6/data';

export const options = {
  scenarios: {
    boutique_sweep: {
      executor: 'ramping-arrival-rate',
      startRate: 15,
      timeUnit: '1s',
      preAllocatedVUs: 15,
      maxVUs: 400,  
      stages: [
        { target: 15,  duration: '5m' },
        { target: 45,  duration: '5m' },
        { target: 75,  duration: '5m' },
        { target: 105, duration: '5m' },
        { target: 135, duration: '5m' },
        { target: 150, duration: '5m' },
      ],
    },
  },
  // compute + report p50 alongside p95
  summaryTrendStats: ['avg', 'min', 'med', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

// ENV VARS + CONSTANTS

const BASE_URL = __ENV.TARGET_HOST || 'http://frontend-proxy:8080';
const AGENT_ENDPOINT = __ENV.AGENT_ENDPOINT || 'agent';
const AGENT_PORT = '8010';
const FLAGD_HOST = __ENV.FLAGD_HOST || 'flagd';
const FLAGD_OFREP_PORT = __ENV.FLAGD_OFREP_PORT || '8016';
const FLAGD_BASE_URL = `http://${FLAGD_HOST}:${FLAGD_OFREP_PORT}`;

const products = [
	'0PUK6V6EV0','1YMWWN1N4O','2ZYFJ3GM2N','66VCHSJNUP','6E92ZMYYFZ',
	'9SIQT8TOJO','L9ECAV7KIM','LS4PSXUNUM','OLJCESPC7Z','HQTGWGPNH4',
];

const categories = [
	'binoculars','telescopes','accessories','assembly','travel','books', null,
];

// load people.json at init time
const people = new SharedArray('people', function () {
	    const raw = open('/test-data/people.json');
		return JSON.parse(raw);
	}
);

const agent_prompts = [
	'Show all available products in the store.',
	'What currencies are supported by the Astronomy Shop?',
	'What current promotions are available on binoculars?',
];

// HELPER FUNCTIONS

function getFlagdValue(flagName, defaultValue = 0, context = {}) {
    const res = http.post(
    `${FLAGD_BASE_URL}/ofrep/v1/evaluate/flags/${flagName}`,
    JSON.stringify({ context }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (res.status !== 200) {
    return defaultValue; // mirrors OpenFeature's fallback-to-default behavior
  }

  const body = JSON.parse(res.body);
  return body.value ?? defaultValue;
}

function randomItem(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

function randomInteger(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function uuidv4() {
	// simple UUID v4 generator
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

// TASK FUNCTIONS

function indexTask() {
	group('index', () => {
		const res = http.get(`${BASE_URL}/`);
		check(res, { 'index ok': (r) => r.status >= 200 && r.status < 400 });
	});
}

function browseProductTask() {
	group('browse_product', () => {
		const product = randomItem(products);
		const res = http.get(`${BASE_URL}/api/products/${product}`);
		check(res, { 'browse product ok': (r) => r.status >= 200 && r.status < 400 });
	});
}

function getRecommendationsTask() {
	group('get_recommendations', () => {
		const product = randomItem(products);
		const url = `${BASE_URL}/api/recommendations`;
		const params = { params: { productIds: product } };
		const res = http.get(url + `?productIds=${encodeURIComponent(product)}`);
		check(res, { 'recommendations ok': (r) => r.status >= 200 && r.status < 400 });
	});
}

function getAdsTask() {
	group('get_ads', () => {
		const category = randomItem(categories);
		const q = category === null ? '' : `?contextKeys=${encodeURIComponent(category)}`;
		const res = http.get(`${BASE_URL}/api/data/${q}`);
		check(res, { 'get ads ok': (r) => r.status >= 200 && r.status < 400 });
	});
}

function viewCartTask() {
	group('view_cart', () => {
		const res = http.get(`${BASE_URL}/api/cart`);
		check(res, { 'view cart ok': (r) => r.status >= 200 && r.status < 400 });
	});
}

function addToCartTask(user) {
	group('add_to_cart', () => {
		const uid = user || uuidv4();
		const product = randomItem(products);
		const quantity = randomItem([1, 2, 3, 4, 5, 10]);
		// visit product
		http.get(`${BASE_URL}/api/products/${product}`);
		const payload = JSON.stringify({
			item: { productId: product, quantity: quantity },
			userId: uid,
		});
		const res = http.post(`${BASE_URL}/api/cart`, payload, { headers: { 'Content-Type': 'application/json' } });
		check(res, { 'add to cart ok': (r) => r.status >= 200 && r.status < 400 });
		return { userId: uid, product, quantity };
	});
}

function checkoutTask() {
	group('checkout', () => {
		const user = uuidv4();
		const cart = addToCartTask(user);
		const person = Object.assign({}, randomItem(people));
		person.userId = user;
		const res = http.post(`${BASE_URL}/api/checkout`, JSON.stringify(person), { headers: { 'Content-Type': 'application/json' } });
		check(res, { 'checkout ok': (r) => r.status >= 200 && r.status < 400 });
	});
}

function checkoutMultiTask() {
	group('checkout_multi', () => {
		const userId = uuidv4();
		const itemCount = randomItem([2, 3, 4]);
		for (let i = 0; i < itemCount; i++) {
			addToCartTask(userId);
		}
		const person = Object.assign({}, randomItem(people));
		person.userId = userId;
		const res = http.post(`${BASE_URL}/api/checkout`, JSON.stringify(person), { headers: { 'Content-Type': 'application/json' } });
		check(res, { 'checkout multi ok': (r) => r.status >= 200 && r.status < 400 });
	});
}

function floodHomeTask() {
	group('flood_home', () => {	
		floodCount = getFlagdValue('loadGeneratorFloodHomepage');
		
		if (floodCount > 0) {
			for (let i = 0; i < floodCount; i++) {
				const res = http.get(`${BASE_URL}/`);
				check(res, { 'index ok': (r) => r.status >= 200 && r.status < 400 });
			}
		}
	});
}

function askAgentTask() {
	group('ask_agent', () => {
		const prompt = randomItem(agent_prompts);
		const url = `http://${AGENT_ENDPOINT}:${AGENT_PORT}/prompt`;
		const res = http.post(url, JSON.stringify({ message: prompt }), { headers: { 'Content-Type': 'application/json' } });
		check(res, { 'agent ok': (r) => r.status >= 200 && r.status < 400 });
	});
}

// TASK DISTRIBUION

const weightedTasks = [
	{ weight: 1, run: indexTask },
	{ weight: 10, run: browseProductTask },
	{ weight: 3, run: getRecommendationsTask },
	{ weight: 3, run: getAdsTask },
	{ weight: 3, run: viewCartTask },
	{ weight: 2, run: addToCartTask },
	{ weight: 1, run: checkoutTask },
	{ weight: 1, run: checkoutMultiTask },
	{ weight: 5, run: floodHomeTask },
	{ weight: 3, run: askAgentTask },
];

const totalTaskWeight = weightedTasks.reduce((s, t) => s + t.weight, 0);

function runWeightedTask() {
	let selection = Math.random() * totalTaskWeight;
	for (const task of weightedTasks) {
		selection -= task.weight;
		if (selection < 0) {
			task.run();
			return;
		}
	}
}

export default function () {
	// run an index once per VU start-ish
	if (__ITER === 0) {
		indexTask();
	}

	runWeightedTask();
}

