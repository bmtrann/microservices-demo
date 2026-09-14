import http from 'k6/http';
import { check, group } from 'k6';

export const options = {
  scenarios: {
    boutique_sweep: {
      executor: 'ramping-arrival-rate',
      startRate: 15,
      timeUnit: '1s',
      preAllocatedVUs: 15,
      maxVUs: 200,  
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

const BASE_URL = __ENV.TARGET_HOST || 'http://frontend.default.svc.cluster.local';
const products = [
    '0PUK6V6EV0',
    '1YMWWN1N4O',
    '2ZYFJ3GM2N',
    '66VCHSJNUP',
    '6E92ZMYYFZ',
    '9SIQT8TOJO',
    'L9ECAV7KIM',
    'LS4PSXUNUM',
    'OLJCESPC7Z'];

const currencies = ['EUR', 'USD', 'JPY', 'CAD', 'GBP', 'TRY'];
const weightedTasks = [
  { weight: 1, run: indexTask },
  { weight: 2, run: setCurrencyTask },
  { weight: 10, run: browseProductTask },
  { weight: 2, run: addToCartTask },
  { weight: 3, run: viewCartTask },
  { weight: 1, run: checkoutTask },
];
const totalTaskWeight = weightedTasks.reduce((sum, task) => sum + task.weight, 0);

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function indexTask() {
  group('index', () => {
    const res = http.get(`${BASE_URL}/`);
    check(res, { 'index ok': (r) => r.status < 400 });
  });
}

function setCurrencyTask() {
  group('setCurrency', () => {
    // Randomly select a currency from the list
    const randomCurrency = currencies[Math.floor(Math.random() * currencies.length)];
    const res = http.post(`${BASE_URL}/setCurrency`, { currency_code: randomCurrency });
    check(res, { 'currency set ok': (r) => r.status < 400 });
  });
}

function browseProductTask() {
  group('browseProduct', () => {
    const product = products[Math.floor(Math.random() * products.length)];
    const res = http.get(`${BASE_URL}/product/${product}`);
    check(res, { 'browse products ok': (r) => r.status < 400 });
  });
}

function viewCartTask() {
  group('viewCart', () => {
    const res = http.get(`${BASE_URL}/cart`);
    check(res, { 'view cart ok': (r) => r.status < 400 });
  });
}

function addToCartTask() {
  group('addToCart', () => {
    const productId = products[Math.floor(Math.random() * products.length)];
    http.get(`${BASE_URL}/product/${productId}`);
    const res = http.post(`${BASE_URL}/cart`, {
      product_id: productId,
      quantity: randomInteger(1, 10),
    });

    check(res, { 'add to cart ok': (r) => r.status < 400 });
  });
}

function checkoutTask() {
  group('checkout', () => {
    addToCartTask();
    const currentYear = new Date().getFullYear() + 1;

    const res = http.post(`${BASE_URL}/cart/checkout`, {
      email: 'fake@example.com',
      street_address: '123 Fake St',
      zip_code: '12345',
      city: 'Faketown',
      state: 'CA',
      country: 'USA',
      credit_card_number: '4111111111111111',
      credit_card_expiration_month: `${randomInteger(1, 12)}`,
      credit_card_expiration_year: `${randomInteger(currentYear, currentYear + 70)}`,
      credit_card_cvv: `${randomInteger(100, 999)}`,
    });
    check(res, { 'checkout ok': (r) => r.status < 400 });
  });
}

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
  if (__ITER === 0) {
    indexTask();
  }

  runWeightedTask();
}