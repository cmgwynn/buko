import type { Nutrients } from '../../types';

// USDA FoodData Central SR Legacy snapshots retrieved 2026-10-24; values per 100 g.
// Public-domain source: https://fdc.nal.usda.gov/food-details/{fdcId}/nutrients
export const LIBRARY_FOODS = {
  "apple": {
    "fdcId": "171688",
    "description": "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)",
    "category": "Fruits and Fruit Juices",
    "per100g": {
      "calories": 52,
      "protein": 0.26,
      "carbs": 13.81,
      "fat": 0.17,
      "sugars": 10.39,
      "saturatedFat": 0.028,
      "sodiumMg": 1,
      "fiber": 2.4
    }
  },
  "avocado": {
    "fdcId": "171705",
    "description": "Avocados, raw, all commercial varieties",
    "category": "Fruits and Fruit Juices",
    "per100g": {
      "calories": 160,
      "protein": 2,
      "carbs": 8.53,
      "fat": 14.7,
      "sugars": 0.66,
      "saturatedFat": 2.13,
      "sodiumMg": 7,
      "fiber": 6.7
    }
  },
  "banana": {
    "fdcId": "173944",
    "description": "Bananas, raw",
    "category": "Fruits and Fruit Juices",
    "per100g": {
      "calories": 89,
      "protein": 1.09,
      "carbs": 22.8,
      "fat": 0.33,
      "sugars": 12.2,
      "saturatedFat": 0.112,
      "sodiumMg": 1,
      "fiber": 2.6
    }
  },
  "bellPepper": {
    "fdcId": "170108",
    "description": "Peppers, sweet, red, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 26,
      "protein": 0.99,
      "carbs": 6.03,
      "fat": 0.3,
      "sugars": 4.2,
      "saturatedFat": 0.059,
      "sodiumMg": 4,
      "fiber": 2.1
    }
  },
  "blackBeans": {
    "fdcId": "173735",
    "description": "Beans, black, mature seeds, cooked, boiled, without salt",
    "category": "Legumes and Legume Products",
    "per100g": {
      "calories": 132,
      "protein": 8.86,
      "carbs": 23.7,
      "fat": 0.54,
      "sugars": 0.32,
      "saturatedFat": 0.139,
      "sodiumMg": 1,
      "fiber": 8.7
    }
  },
  "blueberries": {
    "fdcId": "171711",
    "description": "Blueberries, raw",
    "category": "Fruits and Fruit Juices",
    "per100g": {
      "calories": 57,
      "protein": 0.74,
      "carbs": 14.5,
      "fat": 0.33,
      "sugars": 9.96,
      "saturatedFat": 0.028,
      "sodiumMg": 1,
      "fiber": 2.4
    }
  },
  "bread": {
    "fdcId": "172688",
    "description": "Bread, whole-wheat, commercially prepared",
    "category": "Baked Products",
    "per100g": {
      "calories": 252,
      "protein": 12.4,
      "carbs": 42.7,
      "fat": 3.5,
      "sugars": 4.34,
      "saturatedFat": 0.722,
      "sodiumMg": 455,
      "fiber": 6
    }
  },
  "broccoli": {
    "fdcId": "170379",
    "description": "Broccoli, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 34,
      "protein": 2.82,
      "carbs": 6.64,
      "fat": 0.37,
      "sugars": 1.7,
      "saturatedFat": 0.114,
      "sodiumMg": 33,
      "fiber": 2.6
    }
  },
  "brownRice": {
    "fdcId": "169704",
    "description": "Rice, brown, long-grain, cooked (Includes foods for USDA's Food Distribution Program)",
    "category": "Cereal Grains and Pasta",
    "per100g": {
      "calories": 123,
      "protein": 2.74,
      "carbs": 25.6,
      "fat": 0.97,
      "sugars": 0.24,
      "saturatedFat": 0.26,
      "sodiumMg": 4,
      "fiber": 1.6
    }
  },
  "bulgur": {
    "fdcId": "170287",
    "description": "Bulgur, cooked",
    "category": "Cereal Grains and Pasta",
    "per100g": {
      "calories": 83,
      "protein": 3.08,
      "carbs": 18.6,
      "fat": 0.24,
      "sugars": 0.1,
      "saturatedFat": 0.042,
      "sodiumMg": 5,
      "fiber": 4.5
    }
  },
  "cabbage": {
    "fdcId": "169975",
    "description": "Cabbage, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 25,
      "protein": 1.28,
      "carbs": 5.8,
      "fat": 0.1,
      "sugars": 3.2,
      "saturatedFat": 0.034,
      "sodiumMg": 18,
      "fiber": 2.5
    }
  },
  "cannedTomato": {
    "fdcId": "170501",
    "description": "Tomatoes, crushed, canned",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 32,
      "protein": 1.64,
      "carbs": 7.29,
      "fat": 0.28,
      "sugars": 4.4,
      "saturatedFat": 0.04,
      "sodiumMg": 186,
      "fiber": 1.9
    }
  },
  "carrot": {
    "fdcId": "170393",
    "description": "Carrots, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 41,
      "protein": 0.93,
      "carbs": 9.58,
      "fat": 0.24,
      "sugars": 4.74,
      "saturatedFat": 0.032,
      "sodiumMg": 69,
      "fiber": 2.8
    }
  },
  "cauliflower": {
    "fdcId": "169986",
    "description": "Cauliflower, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 25,
      "protein": 1.92,
      "carbs": 4.97,
      "fat": 0.28,
      "sugars": 1.91,
      "saturatedFat": 0.13,
      "sodiumMg": 30,
      "fiber": 2
    }
  },
  "chicken": {
    "fdcId": "171077",
    "description": "Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw",
    "category": "Poultry Products",
    "per100g": {
      "calories": 120,
      "protein": 22.5,
      "carbs": 0,
      "fat": 2.62,
      "sugars": 0,
      "saturatedFat": 0.563,
      "sodiumMg": 45,
      "fiber": 0
    }
  },
  "chickpeas": {
    "fdcId": "173757",
    "description": "Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt",
    "category": "Legumes and Legume Products",
    "per100g": {
      "calories": 164,
      "protein": 8.86,
      "carbs": 27.42,
      "fat": 2.59,
      "sugars": 4.8,
      "saturatedFat": 0.269,
      "sodiumMg": 7,
      "fiber": 7.6
    }
  },
  "chili": {
    "fdcId": "170932",
    "description": "Spices, pepper, red or cayenne",
    "category": "Spices and Herbs",
    "per100g": {
      "calories": 318,
      "protein": 12,
      "carbs": 56.6,
      "fat": 17.3,
      "sugars": 10.3,
      "saturatedFat": 3.26,
      "sodiumMg": 30,
      "fiber": 27.2
    }
  },
  "cilantro": {
    "fdcId": "169997",
    "description": "Coriander (cilantro) leaves, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 23,
      "protein": 2.13,
      "carbs": 3.67,
      "fat": 0.52,
      "sugars": 0.87,
      "saturatedFat": 0.014,
      "sodiumMg": 46,
      "fiber": 2.8
    }
  },
  "cinnamon": {
    "fdcId": "171320",
    "description": "Spices, cinnamon, ground",
    "category": "Spices and Herbs",
    "per100g": {
      "calories": 247,
      "protein": 3.99,
      "carbs": 80.6,
      "fat": 1.24,
      "sugars": 2.17,
      "saturatedFat": 0.345,
      "sodiumMg": 10,
      "fiber": 53.1
    }
  },
  "cocoa": {
    "fdcId": "169593",
    "description": "Cocoa, dry powder, unsweetened",
    "category": "Sweets",
    "per100g": {
      "calories": 228,
      "protein": 19.6,
      "carbs": 57.9,
      "fat": 13.7,
      "sugars": 1.75,
      "saturatedFat": 8.07,
      "sodiumMg": 21,
      "fiber": 37
    }
  },
  "corn": {
    "fdcId": "168544",
    "description": "Corn, sweet, white, frozen, kernels cut off cob, unprepared",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 88,
      "protein": 3.02,
      "carbs": 20.7,
      "fat": 0.77,
      "sugars": 9.09,
      "saturatedFat": 0.184,
      "sodiumMg": 3,
      "fiber": 2.9
    }
  },
  "cottageCheese": {
    "fdcId": "173417",
    "description": "Cheese, cottage, lowfat, 1% milkfat",
    "category": "Dairy and Egg Products",
    "per100g": {
      "calories": 72,
      "protein": 12.4,
      "carbs": 2.72,
      "fat": 1.02,
      "sugars": 2.72,
      "saturatedFat": 0.645,
      "sodiumMg": 406,
      "fiber": 0
    }
  },
  "cucumber": {
    "fdcId": "168409",
    "description": "Cucumber, with peel, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 15,
      "protein": 0.65,
      "carbs": 3.63,
      "fat": 0.11,
      "sugars": 1.67,
      "saturatedFat": 0.037,
      "sodiumMg": 2,
      "fiber": 0.5
    }
  },
  "cumin": {
    "fdcId": "170923",
    "description": "Spices, cumin seed",
    "category": "Spices and Herbs",
    "per100g": {
      "calories": 375,
      "protein": 17.8,
      "carbs": 44.2,
      "fat": 22.3,
      "sugars": 2.25,
      "saturatedFat": 1.54,
      "sodiumMg": 168,
      "fiber": 10.5
    }
  },
  "edamame": {
    "fdcId": "168411",
    "description": "Edamame, frozen, prepared",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 121,
      "protein": 11.91,
      "carbs": 8.91,
      "fat": 5.2,
      "sugars": 2.18,
      "saturatedFat": 0.62,
      "sodiumMg": 6,
      "fiber": 5.2
    }
  },
  "egg": {
    "fdcId": "171287",
    "description": "Egg, whole, raw, fresh",
    "category": "Dairy and Egg Products",
    "per100g": {
      "calories": 143,
      "protein": 12.6,
      "carbs": 0.72,
      "fat": 9.51,
      "sugars": 0.37,
      "saturatedFat": 3.13,
      "sodiumMg": 142,
      "fiber": 0
    }
  },
  "garlic": {
    "fdcId": "169230",
    "description": "Garlic, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 149,
      "protein": 6.36,
      "carbs": 33.1,
      "fat": 0.5,
      "sugars": 1,
      "saturatedFat": 0.089,
      "sodiumMg": 17,
      "fiber": 2.1
    }
  },
  "garlicPowder": {
    "fdcId": "171325",
    "description": "Spices, garlic powder",
    "category": "Spices and Herbs",
    "per100g": {
      "calories": 331,
      "protein": 16.6,
      "carbs": 72.7,
      "fat": 0.73,
      "sugars": 2.43,
      "saturatedFat": 0.249,
      "sodiumMg": 60,
      "fiber": 9
    }
  },
  "ginger": {
    "fdcId": "169231",
    "description": "Ginger root, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 80,
      "protein": 1.82,
      "carbs": 17.8,
      "fat": 0.75,
      "sugars": 1.7,
      "saturatedFat": 0.203,
      "sodiumMg": 13,
      "fiber": 2
    }
  },
  "greenBeans": {
    "fdcId": "169961",
    "description": "Beans, snap, green, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 31,
      "protein": 1.83,
      "carbs": 6.97,
      "fat": 0.22,
      "sugars": 3.26,
      "saturatedFat": 0.05,
      "sodiumMg": 6,
      "fiber": 2.7
    }
  },
  "hummus": {
    "fdcId": "172454",
    "description": "Hummus, home prepared",
    "category": "Legumes and Legume Products",
    "per100g": {
      "calories": 177,
      "protein": 4.86,
      "carbs": 20.1,
      "fat": 8.59,
      "sugars": 0.27,
      "saturatedFat": 1.14,
      "sodiumMg": 242,
      "fiber": 4
    }
  },
  "lemon": {
    "fdcId": "167747",
    "description": "Lemon juice, raw",
    "category": "Fruits and Fruit Juices",
    "per100g": {
      "calories": 22,
      "protein": 0.35,
      "carbs": 6.9,
      "fat": 0.24,
      "sugars": 2.52,
      "saturatedFat": 0.04,
      "sodiumMg": 1,
      "fiber": 0.3
    }
  },
  "lentils": {
    "fdcId": "172421",
    "description": "Lentils, mature seeds, cooked, boiled, without salt",
    "category": "Legumes and Legume Products",
    "per100g": {
      "calories": 116,
      "protein": 9.02,
      "carbs": 20.1,
      "fat": 0.38,
      "sugars": 1.8,
      "saturatedFat": 0.053,
      "sodiumMg": 2,
      "fiber": 7.9
    }
  },
  "lettuce": {
    "fdcId": "169247",
    "description": "Lettuce, cos or romaine, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 17,
      "protein": 1.23,
      "carbs": 3.29,
      "fat": 0.3,
      "sugars": 1.19,
      "saturatedFat": 0.039,
      "sodiumMg": 8,
      "fiber": 2.1
    }
  },
  "lime": {
    "fdcId": "168156",
    "description": "Lime juice, raw",
    "category": "Fruits and Fruit Juices",
    "per100g": {
      "calories": 25,
      "protein": 0.42,
      "carbs": 8.42,
      "fat": 0.07,
      "sugars": 1.69,
      "saturatedFat": 0.008,
      "sodiumMg": 2,
      "fiber": 0.4
    }
  },
  "milk": {
    "fdcId": "169868",
    "description": "Milk, fluid, nonfat, calcium fortified (fat free or skim)",
    "category": "Dairy and Egg Products",
    "per100g": {
      "calories": 35,
      "protein": 3.4,
      "carbs": 4.85,
      "fat": 0.18,
      "sugars": 4.85,
      "saturatedFat": 0.117,
      "sodiumMg": 52,
      "fiber": 0
    }
  },
  "mushrooms": {
    "fdcId": "169251",
    "description": "Mushrooms, white, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 22,
      "protein": 3.09,
      "carbs": 3.26,
      "fat": 0.34,
      "sugars": 1.98,
      "saturatedFat": 0.05,
      "sodiumMg": 5,
      "fiber": 1
    }
  },
  "oats": {
    "fdcId": "173904",
    "description": "Cereals, oats, regular and quick, not fortified, dry",
    "category": "Breakfast Cereals",
    "per100g": {
      "calories": 379,
      "protein": 13.2,
      "carbs": 67.7,
      "fat": 6.52,
      "sugars": 0.99,
      "saturatedFat": 1.11,
      "sodiumMg": 6,
      "fiber": 10.1
    }
  },
  "oliveOil": {
    "fdcId": "171413",
    "description": "Oil, olive, salad or cooking",
    "category": "Fats and Oils",
    "per100g": {
      "calories": 884,
      "protein": 0,
      "carbs": 0,
      "fat": 100,
      "sugars": 0,
      "saturatedFat": 13.8,
      "sodiumMg": 2,
      "fiber": 0
    }
  },
  "onion": {
    "fdcId": "170000",
    "description": "Onions, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 40,
      "protein": 1.1,
      "carbs": 9.34,
      "fat": 0.1,
      "sugars": 4.24,
      "saturatedFat": 0.042,
      "sodiumMg": 4,
      "fiber": 1.7
    }
  },
  "oregano": {
    "fdcId": "171328",
    "description": "Spices, oregano, dried",
    "category": "Spices and Herbs",
    "per100g": {
      "calories": 265,
      "protein": 9,
      "carbs": 68.9,
      "fat": 4.28,
      "sugars": 4.09,
      "saturatedFat": 1.55,
      "sodiumMg": 25,
      "fiber": 42.5
    }
  },
  "parsley": {
    "fdcId": "170416",
    "description": "Parsley, fresh",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 36,
      "protein": 2.97,
      "carbs": 6.33,
      "fat": 0.79,
      "sugars": 0.85,
      "saturatedFat": 0.132,
      "sodiumMg": 56,
      "fiber": 3.3
    }
  },
  "pasta": {
    "fdcId": "169738",
    "description": "Pasta, whole-wheat, dry (Includes foods for USDA's Food Distribution Program)",
    "category": "Cereal Grains and Pasta",
    "per100g": {
      "calories": 352,
      "protein": 13.9,
      "carbs": 73.4,
      "fat": 2.93,
      "sugars": 2.74,
      "saturatedFat": 0.428,
      "sodiumMg": 6,
      "fiber": 9.2
    }
  },
  "peanutButter": {
    "fdcId": "172470",
    "description": "Peanut butter, smooth style, without salt",
    "category": "Legumes and Legume Products",
    "per100g": {
      "calories": 598,
      "protein": 22.2,
      "carbs": 22.3,
      "fat": 51.4,
      "sugars": 10.5,
      "saturatedFat": 10.3,
      "sodiumMg": 17,
      "fiber": 5
    }
  },
  "pepper": {
    "fdcId": "170931",
    "description": "Spices, pepper, black",
    "category": "Spices and Herbs",
    "per100g": {
      "calories": 251,
      "protein": 10.4,
      "carbs": 64,
      "fat": 3.26,
      "sugars": 0.64,
      "saturatedFat": 1.39,
      "sodiumMg": 20,
      "fiber": 25.3
    }
  },
  "pineapple": {
    "fdcId": "169124",
    "description": "Pineapple, raw, all varieties",
    "category": "Fruits and Fruit Juices",
    "per100g": {
      "calories": 50,
      "protein": 0.54,
      "carbs": 13.1,
      "fat": 0.12,
      "sugars": 9.85,
      "saturatedFat": 0.009,
      "sodiumMg": 1,
      "fiber": 1.4
    }
  },
  "pita": {
    "fdcId": "174916",
    "description": "Bread, pita, whole-wheat",
    "category": "Baked Products",
    "per100g": {
      "calories": 262,
      "protein": 9.8,
      "carbs": 55.9,
      "fat": 1.71,
      "sugars": 2.87,
      "saturatedFat": 0.208,
      "sodiumMg": 421,
      "fiber": 6.1
    }
  },
  "potato": {
    "fdcId": "170026",
    "description": "Potatoes, flesh and skin, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 77,
      "protein": 2.05,
      "carbs": 17.5,
      "fat": 0.09,
      "sugars": 0.82,
      "saturatedFat": 0.025,
      "sodiumMg": 6,
      "fiber": 2.1
    }
  },
  "pumpkinSeeds": {
    "fdcId": "170556",
    "description": "Seeds, pumpkin and squash seed kernels, dried",
    "category": "Nut and Seed Products",
    "per100g": {
      "calories": 559,
      "protein": 30.2,
      "carbs": 10.7,
      "fat": 49,
      "sugars": 1.4,
      "saturatedFat": 8.66,
      "sodiumMg": 7,
      "fiber": 6
    }
  },
  "salmon": {
    "fdcId": "175167",
    "description": "Fish, salmon, Atlantic, farmed, raw",
    "category": "Finfish and Shellfish Products",
    "per100g": {
      "calories": 208,
      "protein": 20.4,
      "carbs": 0,
      "fat": 13.4,
      "sugars": 0,
      "saturatedFat": 3.05,
      "sodiumMg": 59,
      "fiber": 0
    }
  },
  "sesame": {
    "fdcId": "170150",
    "description": "Seeds, sesame seeds, whole, dried",
    "category": "Nut and Seed Products",
    "per100g": {
      "calories": 573,
      "protein": 17.7,
      "carbs": 23.4,
      "fat": 49.7,
      "sugars": 0.3,
      "saturatedFat": 6.96,
      "sodiumMg": 11,
      "fiber": 11.8
    }
  },
  "soySauce": {
    "fdcId": "172473",
    "description": "Soy sauce made from soy and wheat (shoyu), low sodium",
    "category": "Legumes and Legume Products",
    "per100g": {
      "calories": 57,
      "protein": 9.05,
      "carbs": 5.59,
      "fat": 0.3,
      "sugars": 0.5,
      "saturatedFat": 0.035,
      "sodiumMg": 3600,
      "fiber": 0.7
    }
  },
  "spinach": {
    "fdcId": "168462",
    "description": "Spinach, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 23,
      "protein": 2.86,
      "carbs": 3.63,
      "fat": 0.39,
      "sugars": 0.42,
      "saturatedFat": 0.063,
      "sodiumMg": 79,
      "fiber": 2.2
    }
  },
  "sweetPotato": {
    "fdcId": "168482",
    "description": "Sweet potato, raw, unprepared (Includes foods for USDA's Food Distribution Program)",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 86,
      "protein": 1.57,
      "carbs": 20.1,
      "fat": 0.05,
      "sugars": 4.18,
      "saturatedFat": 0.018,
      "sodiumMg": 55,
      "fiber": 3
    }
  },
  "tahini": {
    "fdcId": "170189",
    "description": "Seeds, sesame butter, tahini, from roasted and toasted kernels (most common type)",
    "category": "Nut and Seed Products",
    "per100g": {
      "calories": 595,
      "protein": 17,
      "carbs": 21.2,
      "fat": 53.8,
      "sugars": 0.49,
      "saturatedFat": 7.53,
      "sodiumMg": 115,
      "fiber": 9.3
    }
  },
  "tofu": {
    "fdcId": "172448",
    "description": "Tofu, firm, prepared with calcium sulfate and magnesium chloride (nigari)",
    "category": "Legumes and Legume Products",
    "per100g": {
      "calories": 78,
      "protein": 9.04,
      "carbs": 2.85,
      "fat": 4.17,
      "sugars": 0.6,
      "saturatedFat": 0.793,
      "sodiumMg": 12,
      "fiber": 0.9
    }
  },
  "tomato": {
    "fdcId": "170457",
    "description": "Tomatoes, red, ripe, raw, year round average",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 18,
      "protein": 0.88,
      "carbs": 3.89,
      "fat": 0.2,
      "sugars": 2.63,
      "saturatedFat": 0.028,
      "sodiumMg": 5,
      "fiber": 1.2
    }
  },
  "tortilla": {
    "fdcId": "174081",
    "description": "Tortillas, ready-to-bake or -fry, whole wheat",
    "category": "Baked Products",
    "per100g": {
      "calories": 310,
      "protein": 9.76,
      "carbs": 45.9,
      "fat": 9.76,
      "sugars": 2.44,
      "saturatedFat": 4.88,
      "sodiumMg": 617,
      "fiber": 9.8
    }
  },
  "tuna": {
    "fdcId": "171986",
    "description": "Fish, tuna, light, canned in water, without salt, drained solids",
    "category": "Finfish and Shellfish Products",
    "per100g": {
      "calories": 116,
      "protein": 25.5,
      "carbs": 0,
      "fat": 0.82,
      "sugars": 0,
      "saturatedFat": 0.234,
      "sodiumMg": 50,
      "fiber": 0
    }
  },
  "turmeric": {
    "fdcId": "172231",
    "description": "Spices, turmeric, ground",
    "category": "Spices and Herbs",
    "per100g": {
      "calories": 312,
      "protein": 9.68,
      "carbs": 67.1,
      "fat": 3.25,
      "sugars": 3.21,
      "saturatedFat": 1.84,
      "sodiumMg": 27,
      "fiber": 22.7
    }
  },
  "vinegar": {
    "fdcId": "173469",
    "description": "Vinegar, cider",
    "category": "Spices and Herbs",
    "per100g": {
      "calories": 21,
      "protein": 0,
      "carbs": 0.93,
      "fat": 0,
      "sugars": 0.4,
      "saturatedFat": 0,
      "sodiumMg": 5,
      "fiber": 0
    }
  },
  "whiteBeans": {
    "fdcId": "175203",
    "description": "Beans, white, mature seeds, cooked, boiled, without salt",
    "category": "Legumes and Legume Products",
    "per100g": {
      "calories": 139,
      "protein": 9.73,
      "carbs": 25.1,
      "fat": 0.35,
      "sugars": 0.34,
      "saturatedFat": 0.091,
      "sodiumMg": 6,
      "fiber": 6.3
    }
  },
  "yogurt": {
    "fdcId": "170894",
    "description": "Yogurt, Greek, plain, nonfat (Includes foods for USDA's Food Distribution Program)",
    "category": "Dairy and Egg Products",
    "per100g": {
      "calories": 59,
      "protein": 10.19,
      "carbs": 3.6,
      "fat": 0.39,
      "sugars": 3.24,
      "saturatedFat": 0.117,
      "sodiumMg": 36,
      "fiber": 0
    }
  },
  "zucchini": {
    "fdcId": "169291",
    "description": "Squash, summer, zucchini, includes skin, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 17,
      "protein": 1.21,
      "carbs": 3.11,
      "fat": 0.32,
      "sugars": 2.5,
      "saturatedFat": 0.084,
      "sodiumMg": 8,
      "fiber": 1
    }
  },
  "scallion": {
    "fdcId": "170005",
    "description": "Onions, spring or scallions (includes tops and bulb), raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 32,
      "protein": 1.83,
      "carbs": 7.34,
      "fat": 0.19,
      "sugars": 2.33,
      "saturatedFat": 0.032,
      "sodiumMg": 16,
      "fiber": 2.6
    }
  },
  "sesameOil": {
    "fdcId": "171016",
    "description": "Oil, sesame, salad or cooking",
    "category": "Fats and Oils",
    "per100g": {
      "calories": 884,
      "protein": 0,
      "carbs": 0,
      "fat": 100,
      "sugars": 0,
      "saturatedFat": 14.2,
      "sodiumMg": 0,
      "fiber": 0
    }
  },
  "whiteVinegar": {
    "fdcId": "172237",
    "description": "Vinegar, distilled",
    "category": "Spices and Herbs",
    "per100g": {
      "calories": 18,
      "protein": 0,
      "carbs": 0.04,
      "fat": 0,
      "sugars": 0.04,
      "saturatedFat": 0,
      "sodiumMg": 2,
      "fiber": 0
    }
  },
  "basil": {
    "fdcId": "172232",
    "description": "Basil, fresh",
    "category": "Spices and Herbs",
    "per100g": {
      "calories": 23,
      "protein": 3.15,
      "carbs": 2.65,
      "fat": 0.64,
      "sugars": 0.3,
      "saturatedFat": 0.041,
      "sodiumMg": 4,
      "fiber": 1.6
    }
  },
  "celery": {
    "fdcId": "169988",
    "description": "Celery, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 14,
      "protein": 0.69,
      "carbs": 2.97,
      "fat": 0.17,
      "sugars": 1.34,
      "saturatedFat": 0.042,
      "sodiumMg": 80,
      "fiber": 1.6
    }
  },
  "eggplant": {
    "fdcId": "169228",
    "description": "Eggplant, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 25,
      "protein": 0.98,
      "carbs": 5.88,
      "fat": 0.18,
      "sugars": 3.53,
      "saturatedFat": 0.034,
      "sodiumMg": 2,
      "fiber": 3
    }
  },
  "quinoa": {
    "fdcId": "168917",
    "description": "Quinoa, cooked",
    "category": "Cereal Grains and Pasta",
    "per100g": {
      "calories": 120,
      "protein": 4.4,
      "carbs": 21.3,
      "fat": 1.92,
      "sugars": 0.87,
      "saturatedFat": 0.231,
      "sodiumMg": 7,
      "fiber": 2.8
    }
  },
  "kidneyBeans": {
    "fdcId": "175194",
    "description": "Beans, kidney, red, mature seeds, cooked, boiled, without salt",
    "category": "Legumes and Legume Products",
    "per100g": {
      "calories": 127,
      "protein": 8.67,
      "carbs": 22.8,
      "fat": 0.5,
      "sugars": 0.32,
      "saturatedFat": 0.072,
      "sodiumMg": 2,
      "fiber": 7.4
    }
  },
  "shrimp": {
    "fdcId": "174210",
    "description": "Crustaceans, shrimp, mixed species, raw (may contain additives to retain moisture)",
    "category": "Finfish and Shellfish Products",
    "per100g": {
      "calories": 71,
      "protein": 13.61,
      "carbs": 0.91,
      "fat": 1.01,
      "sugars": 0,
      "saturatedFat": 0.261,
      "sodiumMg": 566,
      "fiber": 0
    }
  },
  "cod": {
    "fdcId": "171955",
    "description": "Fish, cod, Atlantic, raw",
    "category": "Finfish and Shellfish Products",
    "per100g": {
      "calories": 82,
      "protein": 17.8,
      "carbs": 0,
      "fat": 0.67,
      "sugars": 0,
      "saturatedFat": 0.131,
      "sodiumMg": 54,
      "fiber": 0
    }
  },
  "turkey": {
    "fdcId": "172850",
    "description": "Turkey, ground, 93% lean, 7% fat, raw",
    "category": "Poultry Products",
    "per100g": {
      "calories": 150,
      "protein": 18.7,
      "carbs": 0,
      "fat": 8.34,
      "sugars": 0,
      "saturatedFat": 2.17,
      "sodiumMg": 69,
      "fiber": 0
    }
  },
  "whiteRiceDry": {
    "fdcId": "168877",
    "description": "Rice, white, long-grain, regular, raw, enriched",
    "category": "Cereal Grains and Pasta",
    "per100g": {
      "calories": 365,
      "protein": 7.13,
      "carbs": 80,
      "fat": 0.66,
      "sugars": 0.12,
      "saturatedFat": 0.18,
      "sodiumMg": 5,
      "fiber": 1.3
    }
  },
  "fishSauce": {
    "fdcId": "174531",
    "description": "Sauce, fish, ready-to-serve",
    "category": "Soups, Sauces, and Gravies",
    "per100g": {
      "calories": 35,
      "protein": 5.06,
      "carbs": 3.64,
      "fat": 0.01,
      "sugars": 3.64,
      "saturatedFat": 0.003,
      "sodiumMg": 7850,
      "fiber": 0
    }
  },
  "sugar": {
    "fdcId": "169655",
    "description": "Sugars, granulated",
    "category": "Sweets",
    "per100g": {
      "calories": 387,
      "protein": 0,
      "carbs": 100,
      "fat": 0,
      "sugars": 99.8,
      "saturatedFat": 0,
      "sodiumMg": 1,
      "fiber": 0
    }
  },
  "chayote": {
    "fdcId": "170402",
    "description": "Chayote, fruit, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 19,
      "protein": 0.82,
      "carbs": 4.51,
      "fat": 0.13,
      "sugars": 1.66,
      "saturatedFat": 0.028,
      "sodiumMg": 2,
      "fiber": 1.7
    }
  },
  "mungBeans": {
    "fdcId": "174257",
    "description": "Mung beans, mature seeds, cooked, boiled, without salt",
    "category": "Legumes and Legume Products",
    "per100g": {
      "calories": 105,
      "protein": 7.02,
      "carbs": 19.2,
      "fat": 0.38,
      "sugars": 2,
      "saturatedFat": 0.116,
      "sodiumMg": 2,
      "fiber": 7.6
    }
  },
  "squash": {
    "fdcId": "169295",
    "description": "Squash, winter, butternut, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 45,
      "protein": 1,
      "carbs": 11.7,
      "fat": 0.1,
      "sugars": 2.2,
      "saturatedFat": 0.021,
      "sodiumMg": 4,
      "fiber": 2
    }
  },
  "pear": {
    "fdcId": "169118",
    "description": "Pears, raw",
    "category": "Fruits and Fruit Juices",
    "per100g": {
      "calories": 57,
      "protein": 0.36,
      "carbs": 15.2,
      "fat": 0.14,
      "sugars": 9.75,
      "saturatedFat": 0.022,
      "sodiumMg": 1,
      "fiber": 3.1
    }
  },
  "strawberry": {
    "fdcId": "167762",
    "description": "Strawberries, raw",
    "category": "Fruits and Fruit Juices",
    "per100g": {
      "calories": 32,
      "protein": 0.67,
      "carbs": 7.68,
      "fat": 0.3,
      "sugars": 4.89,
      "saturatedFat": 0.015,
      "sodiumMg": 1,
      "fiber": 2
    }
  },
  "orange": {
    "fdcId": "169097",
    "description": "Oranges, raw, all commercial varieties",
    "category": "Fruits and Fruit Juices",
    "per100g": {
      "calories": 47,
      "protein": 0.94,
      "carbs": 11.8,
      "fat": 0.12,
      "sugars": 9.35,
      "saturatedFat": 0.015,
      "sodiumMg": 0,
      "fiber": 2.4
    }
  },
  "almond": {
    "fdcId": "170567",
    "description": "Nuts, almonds",
    "category": "Nut and Seed Products",
    "per100g": {
      "calories": 579,
      "protein": 21.2,
      "carbs": 21.6,
      "fat": 49.9,
      "sugars": 4.35,
      "saturatedFat": 3.8,
      "sodiumMg": 1,
      "fiber": 12.5
    }
  },
  "raisin": {
    "fdcId": "168165",
    "description": "Raisins, dark, seedless (Includes foods for USDA's Food Distribution Program)",
    "category": "Fruits and Fruit Juices",
    "per100g": {
      "calories": 299,
      "protein": 3.3,
      "carbs": 79.3,
      "fat": 0.25,
      "sugars": 65.2,
      "saturatedFat": 0.094,
      "sodiumMg": 26,
      "fiber": 4.5
    }
  },
  "parmesan": {
    "fdcId": "170848",
    "description": "Cheese, parmesan, hard",
    "category": "Dairy and Egg Products",
    "per100g": {
      "calories": 392,
      "protein": 35.8,
      "carbs": 3.22,
      "fat": 25,
      "sugars": 0.11,
      "saturatedFat": 14.8,
      "sodiumMg": 1180,
      "fiber": 0
    }
  },
  "jalapeno": {
    "fdcId": "168576",
    "description": "Peppers, jalapeno, raw",
    "category": "Vegetables and Vegetable Products",
    "per100g": {
      "calories": 29,
      "protein": 0.91,
      "carbs": 6.5,
      "fat": 0.37,
      "sugars": 4.12,
      "saturatedFat": 0.092,
      "sodiumMg": 3,
      "fiber": 2.8
    }
  },
  "paprika": {
    "fdcId": "171329",
    "description": "Spices, paprika",
    "category": "Spices and Herbs",
    "per100g": {
      "calories": 282,
      "protein": 14.1,
      "carbs": 54,
      "fat": 12.9,
      "sugars": 10.3,
      "saturatedFat": 2.14,
      "sodiumMg": 68,
      "fiber": 34.9
    }
  }
} satisfies Record<string, {
  fdcId: string; description: string; category: string; per100g: Nutrients;
}>;

export type LibraryFoodKey = keyof typeof LIBRARY_FOODS;
