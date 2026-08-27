import React, { createContext, useContext } from 'react';

type AuthContextType = {
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  user: any;
};

export const AuthContext = createContext<AuthContextType>({
  signIn: async () => {},
  signOut: async () => {},
  user: null,
});

export const useAuth = () => useContext(AuthContext);
