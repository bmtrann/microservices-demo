#!/usr/bin/python
#
# Copyright 2018 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import random
from locust import FastHttpUser, TaskSet, LoadTestShape, between
from faker import Faker
import datetime
import math
fake = Faker()

class ThresholdRampShape(LoadTestShape):
    """
    Ramps VUs upward in fixed steps until p95 latency exceeds
    LATENCY_THRESHOLD_MS, at which point the test stops.
    """
    initial_users = 20
    step_load = 10
    step_time = 120          # dwell time per step (seconds)
    spawn_rate = 10
    latency_threshold_ms = 500   # your agreed threshold
    max_time_limit = 3600        # safety cap, in case threshold is never hit

    def tick(self):
        run_time = self.get_run_time()

        if run_time > self.max_time_limit:
            return None  # safety stop

        current_step = math.floor(run_time / self.step_time)

        # Only check latency once we're past the first step's warm-up
        if current_step >= 1:
            p95 = self.runner.stats.total.get_current_response_time_percentile(0.95)
            if p95 is not None and p95 > self.latency_threshold_ms:
                print(f"Saturation reached: p95={p95}ms at step {current_step} "
                      f"({self.initial_users + current_step * self.step_load} users)")
                return None  # stop the test — this step's VU count is your VU_max

        user_count = self.initial_users + current_step * self.step_load
        return (user_count, self.spawn_rate)

products = [
    '0PUK6V6EV0',
    '1YMWWN1N4O',
    '2ZYFJ3GM2N',
    '66VCHSJNUP',
    '6E92ZMYYFZ',
    '9SIQT8TOJO',
    'L9ECAV7KIM',
    'LS4PSXUNUM',
    'OLJCESPC7Z']

def index(l):
    l.client.get("/")

def setCurrency(l):
    currencies = ['EUR', 'USD', 'JPY', 'CAD', 'GBP', 'TRY']
    l.client.post("/setCurrency",
        {'currency_code': random.choice(currencies)})

def browseProduct(l):
    l.client.get("/product/" + random.choice(products))

def viewCart(l):
    l.client.get("/cart")

def addToCart(l):
    product = random.choice(products)
    l.client.get("/product/" + product)
    l.client.post("/cart", {
        'product_id': product,
        'quantity': random.randint(1,10)})
    
def empty_cart(l):
    l.client.post('/cart/empty')

def checkout(l):
    addToCart(l)
    current_year = datetime.datetime.now().year+1
    l.client.post("/cart/checkout", {
        'email': fake.email(),
        'street_address': fake.street_address(),
        'zip_code': fake.zipcode(),
        'city': fake.city(),
        'state': fake.state_abbr(),
        'country': fake.country(),
        'credit_card_number': fake.credit_card_number(card_type="visa"),
        'credit_card_expiration_month': random.randint(1, 12),
        'credit_card_expiration_year': random.randint(current_year, current_year + 70),
        'credit_card_cvv': f"{random.randint(100, 999)}",
    })
    
def logout(l):
    l.client.get('/logout')  


class UserBehavior(TaskSet):

    def on_start(self):
        index(self)

    tasks = {index: 1,
        setCurrency: 2,
        browseProduct: 10,
        addToCart: 2,
        viewCart: 3,
        checkout: 1}

class WebsiteUser(FastHttpUser):
    tasks = [UserBehavior]
    wait_time = between(1, 10)
