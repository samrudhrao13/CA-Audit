"""Convert a currency amount into words using the Indian numbering system
(Crore/Lakh/Thousand), the convention used on Indian invoices."""

_ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two_digits(n: int) -> str:
    if n < 20:
        return _ONES[n]
    tens, ones = divmod(n, 10)
    return f"{_TENS[tens]} {_ONES[ones]}".strip()


def _three_digits(n: int) -> str:
    hundreds, remainder = divmod(n, 100)
    parts = []
    if hundreds:
        parts.append(f"{_ONES[hundreds]} Hundred")
    if remainder:
        parts.append(_two_digits(remainder))
    return " ".join(parts)


def integer_to_words_indian(n: int) -> str:
    if n == 0:
        return "Zero"

    crore, n = divmod(n, 10_000_000)
    lakh, n = divmod(n, 100_000)
    thousand, n = divmod(n, 1000)
    rest = n

    segments = []
    if crore:
        segments.append(f"{_three_digits(crore)} Crore")
    if lakh:
        segments.append(f"{_two_digits(lakh)} Lakh")
    if thousand:
        segments.append(f"{_two_digits(thousand)} Thousand")
    if rest:
        segments.append(_three_digits(rest))
    return " ".join(segments)


def amount_to_words_indian(amount: float) -> str:
    """E.g. 1180.50 -> 'Rupees One Thousand One Hundred Eighty and Fifty Paise Only'."""
    rupees = int(amount)
    paise = round((amount - rupees) * 100)
    if paise == 100:
        rupees += 1
        paise = 0

    words = f"Rupees {integer_to_words_indian(rupees)}"
    if paise:
        words += f" and {integer_to_words_indian(paise)} Paise"
    return f"{words} Only"
