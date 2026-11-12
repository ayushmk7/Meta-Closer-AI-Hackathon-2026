"""Fictional, diverse names. Random first x last pairs; none reuse a first or last name from the
Facebook clone's seed people (checked against facebook-clone/src/data/seed.ts in tests)."""

from __future__ import annotations

import random

FIRST_NAMES = """
Aaliyah Abel Adaeze Adrian Aiko Alejandro Alina Amara Anaya Andre Anjali Arjun Astrid Aurelio Ayesha
Bao Beatriz Benedict Bianca Bilal Camila Carmen Cecilia Chidi Chloe Cyrus Dalia Damian Daniela Darius
Deja Diego Dmitri Ebony Eitan Elif Emeka Esme Ezra Fatima Felix Freya Gabriel Gemma Hana Hassan
Hector Hiroshi Ibrahim Ileana Imani Ines Isaac Ivy Jae Jamal Javier Jasmine Joaquin Kalani Kamal
Keanu Keira Kenji Kiara Kofi Lailani Lena Liam Lila Lorenzo Luz Mae Malik Mariam Marco Mateo
Mei Mila Minh Miriam Nadia Naveen Nia Nico Noor Obi Olga Omar Paloma Pedro Quinn Rafael Rania
Ravi Rhea Rosa Rowan Ruth Saanvi Salma Santiago Selin Seo-yeon Silas Simone Soren Tala Tariq Tess
Thiago Tomas Uma Valeria Vikram Wen Xavier Yara Yusuf Zahra Zane Zoe Ama Bryce Dev Farah Gus Hal
June Lars Maeve Nils Opal Pia Remy Sage Talia Wren
""".split()

LAST_NAMES = """
Abara Adeyemi Aguilar Alvarez Amari Anand Andersen Bae Banerjee Barros Becker Bello Bergstrom Bhatt
Calder Castillo Chaudhry Cho Coleman Cruz Dang Delgado Diallo Dominguez Duarte Eze Fischer Flores
Fong Fujita Garza Ghosh Gomez Gupta Haddad Halvorsen Hayes Herrera Hoang Ibarra Ikeda Iyer Jaramillo
Jovanovic Kahale Kamara Kapoor Kaur Khalil Kim Kowalski Kruger Lai Lam Lindqvist Lopez Mahmoud
Malik Mendoza Mensah Mehta Moreau Murakami Nakamura Navarro Nguyen Novak Obi Okafor Olsen Osei Pham
Popescu Quintero Rao Reyes Romero Rossi Sahin Salazar Santos Sato Schmidt Shah Silva Sokolov Suarez
Tanaka Tran Torres Usman Valdez Vargas Vu Wagner Wolfe Xu Yamada Yilmaz Young Zamora Zhou Achebe Lund
""".split()


def full_name_pool(
    rng: random.Random, n: int, forbidden_first: set[str], forbidden_last: set[str]
) -> list[tuple[str, str]]:
    firsts = [f for f in FIRST_NAMES if f not in forbidden_first]
    lasts = [last for last in LAST_NAMES if last not in forbidden_last]
    seen: set[tuple[str, str]] = set()
    out: list[tuple[str, str]] = []
    while len(out) < n:
        pair = (rng.choice(firsts), rng.choice(lasts))
        if pair not in seen:
            seen.add(pair)
            out.append(pair)
    return out


def initials(first: str, last: str) -> str:
    return (first[0] + last[0]).upper()
