import secrets
import string

ALPHABET = string.ascii_letters
DIGITS = string.digits
SYMBOLS = "!@#$%^&*()-_=+[]{}"


def generate(length: int = 16) -> str:
    if length < 8:
        raise ValueError("length must be >= 8")

    rng = secrets.SystemRandom()
    required = [
        rng.choice(string.ascii_lowercase),
        rng.choice(string.ascii_uppercase),
        rng.choice(DIGITS),
        rng.choice(SYMBOLS),
    ]
    pool = ALPHABET + DIGITS + SYMBOLS
    rest = [rng.choice(pool) for _ in range(length - len(required))]
    chars = required + rest
    rng.shuffle(chars)
    return "".join(chars)


if __name__ == "__main__":
    print(generate())
