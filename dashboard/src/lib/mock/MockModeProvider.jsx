/**
 * MockModeProvider: Renders nothing but activates mock data simulation
 * when mock mode is explicitly enabled through localStorage or VITE_MOCK_MODE.
 * Placed inside the React tree so hooks work properly.
 */
import { useMockMode } from './useMockMode';

const MOCK_MODE_KEY = 'aero_mock_mode';

export default function MockModeProvider() {
  const stored = typeof window !== 'undefined' ? window.localStorage.getItem(MOCK_MODE_KEY) : null;
  const mockEnabled = stored ? stored === 'true' : import.meta.env.VITE_MOCK_MODE === 'true';
  useMockMode(mockEnabled);
  return null;
}

