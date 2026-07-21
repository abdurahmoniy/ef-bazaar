import { configureStore } from '@reduxjs/toolkit';

import { tournamentApi } from './tournament-api';

export const store = configureStore({
  reducer: {
    [tournamentApi.reducerPath]: tournamentApi.reducer,
  },
  middleware: (getDefault) => getDefault().concat(tournamentApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
