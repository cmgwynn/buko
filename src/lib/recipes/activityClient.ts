import AsyncStorage from '@react-native-async-storage/async-storage';
import { accountStorageWrites } from '../account/storageWrites';
import { createRecipeActivityStore } from './activity';

const recipeActivity = createRecipeActivityStore(AsyncStorage, accountStorageWrites.run);

export const getFavoriteRecipeIds = recipeActivity.getFavorites;
export const setRecipeFavorite = recipeActivity.setFavorite;
export const getRecentlyCookedRecipes = recipeActivity.getRecentlyCooked;
export const recordRecipeCooked = recipeActivity.recordCooked;
