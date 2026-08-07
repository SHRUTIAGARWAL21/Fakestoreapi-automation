/**
 * Datasets for the authentication suite.
 *
 * Credentials come from `config` so nothing real is ever hardcoded here; the
 * invalid cases use values that are structurally plausible but wrong.
 */
import { HttpStatus } from '@/config/constants';
import { config } from '@/config/environments';

export interface InvalidCredentialsDataset {
  readonly name: string;
  readonly credentials: Record<string, unknown> | undefined;
  readonly expectedStatus: number;
  /** Substring the API includes in its (plain-text) error message. */
  readonly expectedMessage: string;
}

const WRONG_CREDENTIALS_MESSAGE = 'username or password is incorrect';
const MISSING_CREDENTIALS_MESSAGE = 'username and password are not provided';

export const INVALID_CREDENTIALS_DATASETS: readonly InvalidCredentialsDataset[] = [
  {
    name: 'correct username with wrong password',
    credentials: { username: config.credentials.username, password: 'definitely-not-the-password' },
    expectedStatus: HttpStatus.UNAUTHORIZED,
    expectedMessage: WRONG_CREDENTIALS_MESSAGE,
  },
  {
    name: 'unknown username',
    credentials: { username: 'no_such_user_exists', password: config.credentials.password },
    expectedStatus: HttpStatus.UNAUTHORIZED,
    expectedMessage: WRONG_CREDENTIALS_MESSAGE,
  },
  {
    name: 'both username and password wrong',
    credentials: { username: 'no_such_user_exists', password: 'wrong' },
    expectedStatus: HttpStatus.UNAUTHORIZED,
    expectedMessage: WRONG_CREDENTIALS_MESSAGE,
  },
  {
    name: 'empty string credentials',
    credentials: { username: '', password: '' },
    expectedStatus: HttpStatus.BAD_REQUEST,
    expectedMessage: MISSING_CREDENTIALS_MESSAGE,
  },
];

export const MISSING_CREDENTIALS_DATASETS: readonly InvalidCredentialsDataset[] = [
  {
    name: 'password omitted',
    credentials: { username: config.credentials.username },
    expectedStatus: HttpStatus.BAD_REQUEST,
    expectedMessage: MISSING_CREDENTIALS_MESSAGE,
  },
  {
    name: 'username omitted',
    credentials: { password: config.credentials.password },
    expectedStatus: HttpStatus.BAD_REQUEST,
    expectedMessage: MISSING_CREDENTIALS_MESSAGE,
  },
  {
    name: 'empty JSON object',
    credentials: {},
    expectedStatus: HttpStatus.BAD_REQUEST,
    expectedMessage: MISSING_CREDENTIALS_MESSAGE,
  },
  {
    name: 'no body at all',
    credentials: undefined,
    expectedStatus: HttpStatus.BAD_REQUEST,
    expectedMessage: MISSING_CREDENTIALS_MESSAGE,
  },
];
