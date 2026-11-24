"""
Nexus OS v5.0 - Standard Utility & Mathematical Tools MCP Plugin.
Provides zero-dependency pure-stdlib financial calculations, unit conversions,
cryptographic hashing, secure password/passphrase generation, and base64 codecs.
Part of the Nexus Edge-to-Desktop Autonomous Engine.
"""

from __future__ import annotations

import base64
import hashlib
import math
import secrets
import string
from typing import Any, Dict, List, Optional, Tuple

from core.mcp.plugin_loader import nexus_tool


# Curated sovereign dictionary for passphrase generation (EFF-inspired distinct memorable words)
_PASSPHRASE_WORDLIST: List[str] = [
    "acorn", "alpine", "amber", "anchor", "anthem", "apex", "apron", "archer", "arrow", "atlas",
    "aurora", "autumn", "badge", "ballet", "banner", "beacon", "beetle", "bison", "blaze", "bloom",
    "boulder", "breeze", "bridge", "bronze", "cabin", "canyon", "castle", "cedar", "cipher", "cliff",
    "clover", "cobalt", "comet", "compass", "copper", "coral", "crater", "crest", "crystal", "delta",
    "diver", "dragon", "drift", "eagle", "echo", "ember", "falcon", "fathom", "feather", "fable",
    "flame", "flint", "forest", "fossil", "frost", "galaxy", "garnet", "geyser", "glacier", "glider",
    "granite", "grove", "harbor", "haven", "hawk", "helium", "helmet", "horizon", "humming", "hunter",
    "icicle", "impact", "indigo", "island", "jaguar", "javelin", "jungle", "jupiter", "kayak", "kernel",
    "kettle", "kinetic", "lagoon", "lantern", "laurel", "legend", "lemur", "lens", "leopard", "liberty",
    "lichen", "lighthouse", "lightning", "linear", "lion", "lizard", "lotus", "lumber", "lunar", "magnet",
    "magpie", "mammoth", "mantle", "maple", "marble", "meadow", "meteor", "minnow", "mirage", "monarch",
    "moonstone", "mosaic", "mountain", "nebula", "nest", "neutron", "nexus", "nickel", "nimbus", "ninja",
    "nova", "oasis", "obsidian", "ocean", "onyx", "orbit", "orchid", "osprey", "owl", "ozone",
    "panther", "parrot", "pebble", "pelican", "penguin", "phoenix", "photon", "pioneer", "planet", "plasma",
    "polar", "prairie", "prism", "pulsar", "pyramid", "quantum", "quartz", "quasar", "rabbit", "radar",
    "radiant", "raven", "reef", "rhino", "ridge", "river", "rocket", "ruby", "saber", "sahara",
    "sailor", "salmon", "sapphire", "saturn", "scale", "scarlet", "scout", "shadow", "shield", "sierra",
    "silver", "skyline", "solace", "solar", "solstice", "sonar", "spark", "spectrum", "spiral", "spring",
    "spruce", "starling", "stellar", "summit", "sunflower", "sunrise", "sunset", "surge", "talon", "tapestry",
    "tempo", "terrace", "thistle", "thunder", "tiger", "timber", "titan", "topaz", "tornado", "torrent",
    "trail", "tundra", "twilight", "uranium", "valley", "vapor", "vector", "velocity", "velvet", "vessel",
    "vortex", "voyage", "walrus", "willow", "winter", "wizard", "wolf", "zenith", "zephyr", "zodiac"
]


@nexus_tool(
    name="calculate_emi",
    description="Calculates monthly loan EMI, total interest, and total payment using standard amortization.",
    agent="OPS-01",
    requires_approval=False,
)
def calculate_emi(
    principal: float,
    annual_rate_pct: float,
    tenure_months: int,
) -> Dict[str, Any]:
    """
    Calculates monthly EMI, total interest, and total repayment amount for a given principal, interest rate, and tenure.

    Args:
        principal: The total loan amount borrowed (must be positive).
        annual_rate_pct: The annual interest rate percentage (e.g. 8.5 for 8.5%).
        tenure_months: The total loan duration in months (must be greater than 0).

    Returns:
        Dictionary containing monthly_emi, total_payment, and total_interest.
    """
    if principal <= 0:
        return {"success": False, "error": "Principal must be greater than 0."}
    if tenure_months <= 0:
        return {"success": False, "error": "Tenure months must be greater than 0."}
    if annual_rate_pct < 0:
        return {"success": False, "error": "Annual rate percentage cannot be negative."}

    monthly_rate = (annual_rate_pct / 100.0) / 12.0

    if monthly_rate == 0:
        emi = principal / tenure_months
    else:
        # Standard EMI amortization formula: P * r * (1 + r)^n / ((1 + r)^n - 1)
        compounded = math.pow(1.0 + monthly_rate, tenure_months)
        emi = principal * monthly_rate * compounded / (compounded - 1.0)

    total_payment = emi * tenure_months
    total_interest = total_payment - principal

    return {
        "success": True,
        "principal": float(principal),
        "annual_rate_pct": float(annual_rate_pct),
        "tenure_months": int(tenure_months),
        "monthly_emi": round(emi, 2),
        "total_payment": round(total_payment, 2),
        "total_interest": round(total_interest, 2),
    }


@nexus_tool(
    name="calculate_compound_interest",
    description="Calculates compound interest and future total accumulated wealth.",
    agent="OPS-01",
    requires_approval=False,
)
def calculate_compound_interest(
    principal: float,
    annual_rate_pct: float,
    years: float,
    compound_frequency_per_year: int = 12,
) -> Dict[str, Any]:
    """
    Calculates total accumulated amount and total compound interest earned.

    Args:
        principal: Initial investment amount (must be non-negative).
        annual_rate_pct: Annual interest rate in percentage (e.g. 7.0 for 7%).
        years: Investment duration in years.
        compound_frequency_per_year: Compounding frequency per year (default 12 for monthly).

    Returns:
        Dictionary with total_amount, total_interest, and input parameters.
    """
    if principal < 0:
        return {"success": False, "error": "Principal cannot be negative."}
    if years < 0:
        return {"success": False, "error": "Years cannot be negative."}
    if compound_frequency_per_year <= 0:
        return {"success": False, "error": "Compounding frequency must be greater than 0."}

    r = annual_rate_pct / 100.0
    n = compound_frequency_per_year
    t = years

    # A = P * (1 + r/n)^(n*t)
    total_amount = principal * math.pow(1.0 + (r / n), n * t)
    total_interest = total_amount - principal

    return {
        "success": True,
        "principal": float(principal),
        "annual_rate_pct": float(annual_rate_pct),
        "years": float(years),
        "compound_frequency_per_year": int(compound_frequency_per_year),
        "total_amount": round(total_amount, 2),
        "total_interest": round(total_interest, 2),
    }


# Unit conversion maps to base units
_LENGTH_TO_METERS: Dict[str, float] = {
    "m": 1.0, "meter": 1.0, "meters": 1.0,
    "km": 1000.0, "kilometer": 1000.0, "kilometers": 1000.0,
    "cm": 0.01, "centimeter": 0.01, "centimeters": 0.01,
    "mm": 0.001, "millimeter": 0.001, "millimeters": 0.001,
    "mi": 1609.344, "mile": 1609.344, "miles": 1609.344,
    "yd": 0.9144, "yard": 0.9144, "yards": 0.9144,
    "ft": 0.3048, "foot": 0.3048, "feet": 0.3048,
    "in": 0.0254, "inch": 0.0254, "inches": 0.0254,
}

_MASS_TO_KG: Dict[str, float] = {
    "kg": 1.0, "kilogram": 1.0, "kilograms": 1.0,
    "g": 0.001, "gram": 0.001, "grams": 0.001,
    "mg": 1e-6, "milligram": 1e-6, "milligrams": 1e-6,
    "lb": 0.45359237, "lbs": 0.45359237, "pound": 0.45359237, "pounds": 0.45359237,
    "oz": 0.028349523125, "ounce": 0.028349523125, "ounces": 0.028349523125,
    "ton": 1000.0, "tonne": 1000.0, "tons": 1000.0,
}

_DATA_TO_BYTES: Dict[str, float] = {
    "b": 1.0, "byte": 1.0, "bytes": 1.0,
    "kb": 1024.0, "kilobyte": 1024.0, "kilobytes": 1024.0,
    "mb": 1024.0 ** 2, "megabyte": 1024.0 ** 2, "megabytes": 1024.0 ** 2,
    "gb": 1024.0 ** 3, "gigabyte": 1024.0 ** 3, "gigabytes": 1024.0 ** 3,
    "tb": 1024.0 ** 4, "terabyte": 1024.0 ** 4, "terabytes": 1024.0 ** 4,
    "pb": 1024.0 ** 5, "petabyte": 1024.0 ** 5, "petabytes": 1024.0 ** 5,
}

_SPEED_TO_MPS: Dict[str, float] = {
    "m/s": 1.0, "mps": 1.0,
    "km/h": 1.0 / 3.6, "kmh": 1.0 / 3.6, "kph": 1.0 / 3.6,
    "mph": 0.44704, "mi/h": 0.44704,
    "knot": 0.514444, "knots": 0.514444,
    "ft/s": 0.3048, "fps": 0.3048,
}


@nexus_tool(
    name="convert_units",
    description="Converts measurements across length, mass, temperature, data storage, and speed.",
    agent="OPS-01",
    requires_approval=False,
)
def convert_units(
    value: float,
    from_unit: str,
    to_unit: str,
) -> Dict[str, Any]:
    """
    Converts a numerical quantity between measurement units.

    Args:
        value: Numerical quantity to convert.
        from_unit: Source unit (e.g. 'km', 'mi', 'kg', 'lb', 'C', 'F', 'MB', 'GB', 'km/h', 'mph').
        to_unit: Target unit to convert into.

    Returns:
        Dictionary with input value, converted result, and category.
    """
    f = from_unit.strip().lower()
    t = to_unit.strip().lower()

    # 1. Temperature Conversion (C, F, K)
    temp_units = {"c", "celsius", "f", "fahrenheit", "k", "kelvin"}
    if f in temp_units and t in temp_units:
        # Convert from source to Celsius
        if f in ("c", "celsius"):
            c = value
        elif f in ("f", "fahrenheit"):
            c = (value - 32.0) * 5.0 / 9.0
        elif f in ("k", "kelvin"):
            c = value - 273.15
        else:
            return {"success": False, "error": f"Unknown temperature unit: {from_unit}"}

        # Convert from Celsius to target
        if t in ("c", "celsius"):
            res = c
        elif t in ("f", "fahrenheit"):
            res = (c * 9.0 / 5.0) + 32.0
        elif t in ("k", "kelvin"):
            res = c + 273.15
        else:
            return {"success": False, "error": f"Unknown temperature unit: {to_unit}"}

        return {
            "success": True,
            "input_value": float(value),
            "from_unit": from_unit,
            "to_unit": to_unit,
            "result": round(res, 4),
            "category": "temperature",
        }

    # 2. Length Conversion
    if f in _LENGTH_TO_METERS and t in _LENGTH_TO_METERS:
        meters = value * _LENGTH_TO_METERS[f]
        res = meters / _LENGTH_TO_METERS[t]
        return {
            "success": True,
            "input_value": float(value),
            "from_unit": from_unit,
            "to_unit": to_unit,
            "result": round(res, 6),
            "category": "length",
        }

    # 3. Mass Conversion
    if f in _MASS_TO_KG and t in _MASS_TO_KG:
        kg = value * _MASS_TO_KG[f]
        res = kg / _MASS_TO_KG[t]
        return {
            "success": True,
            "input_value": float(value),
            "from_unit": from_unit,
            "to_unit": to_unit,
            "result": round(res, 6),
            "category": "mass",
        }

    # 4. Data Storage Conversion
    if f in _DATA_TO_BYTES and t in _DATA_TO_BYTES:
        b = value * _DATA_TO_BYTES[f]
        res = b / _DATA_TO_BYTES[t]
        return {
            "success": True,
            "input_value": float(value),
            "from_unit": from_unit,
            "to_unit": to_unit,
            "result": round(res, 6),
            "category": "data_storage",
        }

    # 5. Speed Conversion
    if f in _SPEED_TO_MPS and t in _SPEED_TO_MPS:
        mps = value * _SPEED_TO_MPS[f]
        res = mps / _SPEED_TO_MPS[t]
        return {
            "success": True,
            "input_value": float(value),
            "from_unit": from_unit,
            "to_unit": to_unit,
            "result": round(res, 6),
            "category": "speed",
        }

    return {
        "success": False,
        "error": f"Incompatible or unsupported unit pair: '{from_unit}' -> '{to_unit}'.",
    }


@nexus_tool(
    name="generate_secure_password",
    description="Generates a cryptographically strong random password with configurable length and character sets.",
    agent="OPS-01",
    requires_approval=False,
)
def generate_secure_password(
    length: int = 16,
    include_symbols: bool = True,
    include_numbers: bool = True,
) -> Dict[str, Any]:
    """
    Generates a cryptographically secure random password using Python's secrets module.

    Args:
        length: Desired length of password (minimum 8 characters, default 16).
        include_symbols: If True, includes special symbols (!@#$%^&*()-_=+).
        include_numbers: If True, includes digits (0-9).

    Returns:
        Dictionary containing password, length, and estimated entropy bits.
    """
    pwd_len = max(8, length)
    
    chars = string.ascii_letters
    required_chars: List[str] = [
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.ascii_uppercase),
    ]

    if include_numbers:
        chars += string.digits
        required_chars.append(secrets.choice(string.digits))

    special_symbols = "!@#$%^&*()-_=+[]{}|;:,.<>?"
    if include_symbols:
        chars += special_symbols
        required_chars.append(secrets.choice(special_symbols))

    # Fill remaining positions
    remaining = pwd_len - len(required_chars)
    password_list = required_chars + [secrets.choice(chars) for _ in range(remaining)]
    
    # Cryptographically secure in-place shuffle
    secrets.SystemRandom().shuffle(password_list)
    password = "".join(password_list)

    # Entropy = length * log2(pool_size)
    entropy_bits = pwd_len * math.log2(len(chars))

    return {
        "success": True,
        "password": password,
        "length": len(password),
        "entropy_bits": round(entropy_bits, 1),
    }


@nexus_tool(
    name="generate_passphrase",
    description="Generates a high-entropy memorable multi-word passphrase using cryptographically secure random selection.",
    agent="OPS-01",
    requires_approval=False,
)
def generate_passphrase(
    words_count: int = 4,
    separator: str = "-",
) -> Dict[str, Any]:
    """
    Generates a memorable, cryptographically secure passphrase using EFF-style dictionary words.

    Args:
        words_count: Number of distinct words to include (minimum 3, default 4).
        separator: Separator character between words (e.g. '-' or ' ').

    Returns:
        Dictionary containing passphrase, words_count, and calculated entropy bits.
    """
    count = max(3, words_count)
    selected_words = [secrets.choice(_PASSPHRASE_WORDLIST) for _ in range(count)]
    passphrase = separator.join(selected_words)

    # Entropy = count * log2(dictionary_size)
    entropy_bits = count * math.log2(len(_PASSPHRASE_WORDLIST))

    return {
        "success": True,
        "passphrase": passphrase,
        "words_count": count,
        "separator": separator,
        "entropy_bits": round(entropy_bits, 1),
    }


@nexus_tool(
    name="encode_base64",
    description="Encodes a UTF-8 string into standard Base64 format.",
    agent="OPS-01",
    requires_approval=False,
)
def encode_base64(text: str) -> Dict[str, Any]:
    """
    Encodes text into Base64 format.

    Args:
        text: Plaintext string to encode.

    Returns:
        Dictionary with encoded base64 string and input/output lengths.
    """
    if text is None:
        return {"success": False, "error": "Input text cannot be None."}

    raw_bytes = text.encode("utf-8")
    encoded = base64.b64encode(raw_bytes).decode("ascii")

    return {
        "success": True,
        "encoded": encoded,
        "input_length": len(text),
        "encoded_length": len(encoded),
    }


@nexus_tool(
    name="decode_base64",
    description="Decodes a standard Base64 string back to UTF-8 plaintext.",
    agent="OPS-01",
    requires_approval=False,
)
def decode_base64(encoded_str: str) -> Dict[str, Any]:
    """
    Decodes a Base64 string back into UTF-8 plaintext.

    Args:
        encoded_str: Base64 formatted string to decode.

    Returns:
        Dictionary with decoded plaintext and length.
    """
    if not encoded_str or not isinstance(encoded_str, str):
        return {"success": False, "error": "Input encoded_str must be a non-empty string."}

    try:
        raw_bytes = base64.b64decode(encoded_str.strip())
        decoded = raw_bytes.decode("utf-8", errors="replace")
        return {
            "success": True,
            "decoded": decoded,
            "decoded_length": len(decoded),
        }
    except Exception as exc:
        return {"success": False, "error": f"Base64 decoding failed: {str(exc)}"}


@nexus_tool(
    name="compute_hash",
    description="Computes cryptographic hash (SHA-256, SHA-512, MD5, SHA-1) of an input string.",
    agent="OPS-01",
    requires_approval=False,
)
def compute_hash(
    text: str,
    algorithm: str = "sha256",
) -> Dict[str, Any]:
    """
    Computes cryptographic digest of text using hashlib algorithms.

    Args:
        text: Input string to hash.
        algorithm: Hashing algorithm ('sha256', 'sha512', 'sha1', 'md5', 'sha384', 'sha3_256').

    Returns:
        Dictionary containing algorithm, computed hex digest, and input length.
    """
    if text is None:
        return {"success": False, "error": "Input text cannot be None."}

    algo = algorithm.strip().lower()
    try:
        hasher = hashlib.new(algo)
        hasher.update(text.encode("utf-8"))
        digest = hasher.hexdigest()
        return {
            "success": True,
            "algorithm": algo,
            "hash": digest,
            "input_length": len(text),
        }
    except Exception as exc:
        return {
            "success": False,
            "error": f"Algorithm '{algorithm}' is not supported: {str(exc)}",
        }


# =============================================================================
# Direct Native Convenience Utilities (Zero-Stub, Pure-Stdlib)
# =============================================================================


@nexus_tool(
    name="loan_emi",
    description="Calculate the monthly EMI for a loan (principal, annual % rate, tenure in months).",
    agent="OPS-01",
    requires_approval=False,
)
def loan_emi(principal: float, annual_rate: float, months: int) -> str:
    """Calculate the monthly EMI for a loan (principal, annual % rate, tenure in months)."""
    p = float(principal)
    n = max(1, int(months))
    r = float(annual_rate) / 12.0 / 100.0  # monthly rate
    if r == 0:
        emi = p / n
    else:
        emi = p * r * (1.0 + r) ** n / ((1.0 + r) ** n - 1.0)
    total = emi * n
    interest = total - p
    return (
        f"EMI: {round(emi, 2)}/month for {n} months. "
        f"Total payable: {round(total, 2)} (interest {round(interest, 2)})."
    )


@nexus_tool(
    name="compound_interest",
    description="Calculate compound interest and final accumulated wealth.",
    agent="OPS-01",
    requires_approval=False,
)
def compound_interest(
    principal: float,
    annual_rate: float,
    years: float,
    times_per_year: int = 1,
) -> str:
    """Calculate compound interest / final amount."""
    p = float(principal)
    r = float(annual_rate) / 100.0
    n = max(1, int(times_per_year))
    t = float(years)
    amount = p * (1.0 + r / n) ** (n * t)
    return (
        f"After {years} year(s): amount = {round(amount, 2)}, "
        f"interest = {round(amount - p, 2)}."
    )


@nexus_tool(
    name="generate_password",
    description="Generate a cryptographically strong random password using Python secrets.",
    agent="OPS-01",
    requires_approval=False,
)
def generate_password(length: int = 16, symbols: bool = True) -> str:
    """Generate a cryptographically strong random password using secrets."""
    pwd_len = max(6, min(128, int(length)))
    alphabet = string.ascii_letters + string.digits
    if symbols:
        alphabet += "!@#$%^&*()-_=+[]{}"
    pwd = "".join(secrets.choice(alphabet) for _ in range(pwd_len))
    return f"Generated password ({pwd_len} chars): {pwd}"


@nexus_tool(
    name="convert_length",
    description="Convert a length between units (mm, cm, m, km, in, ft, yd, mi).",
    agent="OPS-01",
    requires_approval=False,
)
def convert_length(value: float, from_unit: str, to_unit: str) -> str:
    """Convert a length between units (mm, cm, m, km, in, ft, yd, mi)."""
    f = from_unit.lower().strip()
    t = to_unit.lower().strip()
    if f not in _LENGTH_TO_METERS or t not in _LENGTH_TO_METERS:
        return f"Unknown length unit. Supported: {', '.join(sorted(set(_LENGTH_TO_METERS.keys())))}"
    out = float(value) * _LENGTH_TO_METERS[f] / _LENGTH_TO_METERS[t]
    return f"{value} {from_unit} = {round(out, 6)} {to_unit}"


@nexus_tool(
    name="convert_weight",
    description="Convert a weight between units (mg, g, kg, ton, oz, lb).",
    agent="OPS-01",
    requires_approval=False,
)
def convert_weight(value: float, from_unit: str, to_unit: str) -> str:
    """Convert a weight between units (mg, g, kg, ton, oz, lb)."""
    f = from_unit.lower().strip()
    t = to_unit.lower().strip()
    if f not in _MASS_TO_KG or t not in _MASS_TO_KG:
        return f"Unknown weight unit. Supported: {', '.join(sorted(set(_MASS_TO_KG.keys())))}"
    out = float(value) * _MASS_TO_KG[f] / _MASS_TO_KG[t]
    return f"{value} {from_unit} = {round(out, 6)} {to_unit}"


@nexus_tool(
    name="convert_temperature",
    description="Convert a temperature between Celsius, Fahrenheit and Kelvin.",
    agent="OPS-01",
    requires_approval=False,
)
def convert_temperature(value: float, from_unit: str, to_unit: str) -> str:
    """Convert a temperature between C, F and K."""
    f = from_unit.lower().strip()[0] if from_unit.strip() else ""
    t = to_unit.lower().strip()[0] if to_unit.strip() else ""
    v = float(value)
    celsius = {"c": v, "f": (v - 32.0) * 5.0 / 9.0, "k": v - 273.15}.get(f)
    if celsius is None:
        return "Use C, F or K."
    out = {"c": celsius, "f": celsius * 9.0 / 5.0 + 32.0, "k": celsius + 273.15}.get(t)
    if out is None:
        return "Use C, F or K."
    return f"{value}°{from_unit.upper()[0]} = {round(out, 2)}°{to_unit.upper()[0]}"


@nexus_tool(
    name="base64_encode",
    description="Base64-encode text.",
    agent="OPS-01",
    requires_approval=False,
)
def base64_encode(text: str) -> str:
    """Base64-encode text."""
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


@nexus_tool(
    name="base64_decode",
    description="Base64-decode text.",
    agent="OPS-01",
    requires_approval=False,
)
def base64_decode(text: str) -> str:
    """Base64-decode text."""
    return base64.b64decode(text.strip().encode("ascii")).decode("utf-8", errors="replace")


@nexus_tool(
    name="change_case",
    description="Change text case (upper, lower, title, snake, kebab).",
    agent="OPS-01",
    requires_approval=False,
)
def change_case(text: str, case: str = "upper") -> str:
    """Change text case (upper, lower, title, snake, kebab)."""
    c = case.lower().strip()
    if c == "upper":
        return text.upper()
    if c == "lower":
        return text.lower()
    if c == "title":
        return text.title()
    if c == "snake":
        return "_".join(text.lower().split())
    if c == "kebab":
        return "-".join(text.lower().split())
    return text


@nexus_tool(
    name="word_count",
    description="Count characters, words and lines in text.",
    agent="OPS-01",
    requires_approval=False,
)
def word_count(text: str) -> str:
    """Count characters, words and lines in text."""
    chars = len(text)
    words = len(text.split())
    lines = len(text.splitlines())
    return f"{chars} characters, {words} words, {lines} lines."
