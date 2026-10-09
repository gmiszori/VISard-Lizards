export type DietaryType = 'vegan' | 'vegetarian' | 'meat';
export type OccupancyLevel = 'low' | 'medium' | 'high';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  priceStudent: number;
  priceWorker: number;
  priceExternal: number;
  dietary: DietaryType;
  allergens?: string[];
  category: 'Daily Special' | 'Classic' | 'Side';
}

export interface Canteen {
  id: string;
  name: string;
  campus: 'ETH Zentrum' | 'ETH Hönggerberg' | 'UZH Irchel';
  location: string;
  isOpen: boolean;
  hours: string;
  occupancy: OccupancyLevel;
  rating: number;
  imageUrl: string;
  menu: MenuItem[];
}

export const CANTEENS: Canteen[] = [
  {
    id: 'polysnack',
    name: 'PolySnack Zentrum',
    campus: 'ETH Zentrum',
    location: 'HG F 32',
    isOpen: true,
    hours: '11:00 - 14:00',
    occupancy: 'high',
    rating: 4.6,
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=600&q=80',
    menu: [
      {
        id: 'm1',
        name: 'Creamy Wild Mushroom Risotto',
        description: 'Arborio rice cooked with thyme, white wine, wild mushrooms, topped with almond parmesan crisp.',
        priceStudent: 6.50,
        priceWorker: 9.50,
        priceExternal: 11.00,
        dietary: 'vegan',
        allergens: ['Nuts', 'Soy'],
        category: 'Daily Special'
      },
      {
        id: 'm2',
        name: 'Crispy Swiss Chicken Escalope',
        description: 'Golden breaded chicken breast served with rosemary roasted potatoes and lemon butter sauce.',
        priceStudent: 8.90,
        priceWorker: 12.00,
        priceExternal: 13.50,
        dietary: 'meat',
        allergens: ['Gluten', 'Dairy'],
        category: 'Daily Special'
      }
    ]
  },
  {
    id: 'foodlab',
    name: 'FoodLab Hönggerberg',
    campus: 'ETH Hönggerberg',
    location: 'HPH E 10',
    isOpen: true,
    hours: '11:30 - 14:30',
    occupancy: 'low',
    rating: 4.8,
    imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80',
    menu: [
      {
        id: 'm3',
        name: 'Thai Green Curry Bowl',
        description: 'Fragrant green curry with organic tofu, bamboo shoots, Thai basil, served over jasmine rice.',
        priceStudent: 7.20,
        priceWorker: 10.20,
        priceExternal: 11.70,
        dietary: 'vegetarian',
        allergens: ['Soy', 'Sesame'],
        category: 'Daily Special'
      }
    ]
  },
  {
    id: 'clausius',
    name: 'Clausiusbar',
    campus: 'ETH Zentrum',
    location: 'CAB H 41',
    isOpen: false,
    hours: '11:00 - 15:00',
    occupancy: 'medium',
    rating: 4.4,
    imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80',
    menu: [
      {
        id: 'm4',
        name: 'Roasted Sweet Potato & Lentil Bowl',
        description: 'Warm beluga lentils, roasted sweet potatoes, kale, pomegranate seeds, and tahini dressing.',
        priceStudent: 6.80,
        priceWorker: 9.80,
        priceExternal: 11.30,
        dietary: 'vegan',
        allergens: ['Sesame'],
        category: 'Classic'
      }
    ]
  }
];
