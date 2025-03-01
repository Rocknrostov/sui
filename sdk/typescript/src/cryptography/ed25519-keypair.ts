// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import nacl from 'tweetnacl';
import { ExportedKeypair, Keypair, PRIVATE_KEY_SIZE } from './keypair';
import { Ed25519PublicKey } from './ed25519-publickey';
import { isValidHardenedPath, mnemonicToSeedHex } from './mnemonics';
import { derivePath, getPublicKey } from '../utils/ed25519-hd-key';
import { toB64 } from '@mysten/bcs';
import { SignatureScheme } from './signature';

export const DEFAULT_ED25519_DERIVATION_PATH = "m/44'/784'/0'/0'/0'";

/**
 * Ed25519 Keypair data
 */
export interface Ed25519KeypairData {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * An Ed25519 Keypair used for signing transactions.
 */
export class Ed25519Keypair implements Keypair {
  private keypair: Ed25519KeypairData;

  /**
   * Create a new Ed25519 keypair instance.
   * Generate random keypair if no {@link Ed25519Keypair} is provided.
   *
   * @param keypair Ed25519 keypair
   */
  constructor(keypair?: Ed25519KeypairData) {
    if (keypair) {
      this.keypair = keypair;
    } else {
      this.keypair = nacl.sign.keyPair();
    }
  }

  /**
   * Get the key scheme of the keypair ED25519
   */
  getKeyScheme(): SignatureScheme {
    return 'ED25519';
  }

  /**
   * Generate a new random Ed25519 keypair
   */
  static generate(): Ed25519Keypair {
    return new Ed25519Keypair(nacl.sign.keyPair());
  }

  /**
   * Create a Ed25519 keypair from a raw secret key byte array, also known as seed.
   * This is NOT the private scalar which is result of hashing and bit clamping of
   * the raw secret key.
   *
   * The sui.keystore key is a list of Base64 encoded `flag || privkey`. To import
   * a key from sui.keystore to typescript, decode from base64 and remove the first
   * flag byte after checking it is indeed the Ed25519 scheme flag 0x00 (See more
   * on flag for signature scheme: https://github.com/MystenLabs/sui/blob/818406c5abdf7de1b80915a0519071eec3a5b1c7/crates/sui-types/src/crypto.rs#L1650):
   * ```
   * import { Ed25519Keypair, fromB64 } from '@mysten/sui.js';
   * const raw = fromB64(t[1]);
   * if (raw[0] !== 0 || raw.length !== PRIVATE_KEY_SIZE + 1) {
   *   throw new Error('invalid key');
   * }
   * const imported = Ed25519Keypair.fromSecretKey(raw.slice(1))
   * ```
   * @throws error if the provided secret key is invalid and validation is not skipped.
   *
   * @param secretKey secret key byte array
   * @param options: skip secret key validation
   */
  static fromSecretKey(
    secretKey: Uint8Array,
    options?: { skipValidation?: boolean },
  ): Ed25519Keypair {
    const secretKeyLength = secretKey.length;
    if (secretKeyLength !== PRIVATE_KEY_SIZE) {
      throw new Error(
        `Wrong secretKey size. Expected ${PRIVATE_KEY_SIZE} bytes, got ${secretKeyLength}.`,
      );
    }
    const keypair = nacl.sign.keyPair.fromSeed(secretKey);
    if (!options || !options.skipValidation) {
      const encoder = new TextEncoder();
      const signData = encoder.encode('sui validation');
      const signature = nacl.sign.detached(signData, keypair.secretKey);
      if (!nacl.sign.detached.verify(signData, signature, keypair.publicKey)) {
        throw new Error('provided secretKey is invalid');
      }
    }
    return new Ed25519Keypair(keypair);
  }

  /**
   * The public key for this Ed25519 keypair
   */
  getPublicKey(): Ed25519PublicKey {
    return new Ed25519PublicKey(this.keypair.publicKey);
  }

  /**
   * Return the signature for the provided data using Ed25519.
   */
  signData(data: Uint8Array, _useRecoverable: boolean = false): Uint8Array {
    return nacl.sign.detached(data, this.keypair.secretKey);
  }

  /**
   * Derive Ed25519 keypair from mnemonics and path. The mnemonics must be normalized
   * and validated against the english wordlist.
   *
   * If path is none, it will default to m/44'/784'/0'/0'/0', otherwise the path must
   * be compliant to SLIP-0010 in form m/44'/784'/{account_index}'/{change_index}'/{address_index}'.
   */
  static deriveKeypair(mnemonics: string, path?: string): Ed25519Keypair {
    if (path == null) {
      path = DEFAULT_ED25519_DERIVATION_PATH;
    }
    if (!isValidHardenedPath(path)) {
      throw new Error('Invalid derivation path');
    }
    const { key } = derivePath(path, mnemonicToSeedHex(mnemonics));
    const pubkey = getPublicKey(key, false);

    return new Ed25519Keypair({ publicKey: pubkey, secretKey: key });
  }

  export(): ExportedKeypair {
    return {
      schema: 'ED25519',
      privateKey: toB64(this.keypair.secretKey),
    };
  }
}
