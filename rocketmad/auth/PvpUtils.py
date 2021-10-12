import json
from math import sqrt
import logging

log = logging.getLogger('PvpUtils')


def get_cp_multipliers():
    if not hasattr(get_cp_multipliers, 'info'):
        file_ = 'static/data/cp_multipliers.json'
        with open(file_, 'r') as f:
            get_cp_multipliers.info = json.load(f)
    return get_cp_multipliers.info


def get_base_stats(pokemon_id):
    if not hasattr(get_base_stats, 'info'):
        get_base_stats.info = {}
        file_ = 'static/data/base_stats.json'
        with open(file_, 'r') as f:
            j = json.loads(f.read())
        for id_ in j:
            get_base_stats.info[int(id_)] = {
                "attack": float(j[id_].get('attack')),
                "defense": float(j[id_].get('defense')),
                "stamina": float(j[id_].get('stamina'))
            }

    return get_base_stats.info.get(pokemon_id)


def get_evolutions(pokemon_id):
    if not hasattr(get_evolutions, 'info'):
        get_evolutions.info = {}
        file_ = 'static/data/base_stats.json'
        with open(file_, 'r') as f:
            j = json.loads(f.read())
        for id_ in j:
            get_evolutions.info[int(id_)] = j[id_].get('evolutions')
    return get_evolutions.info.get(pokemon_id)


def get_great_product(pokemon_id):
    if not hasattr(get_great_product, 'info'):
        get_great_product.info = {}
        file_ = 'static/data/base_stats.json'
        with open(file_, 'r') as f:
            j = json.loads(f.read())
        for id_ in j:
            get_great_product.info[int(id_)] = j[id_].get('1500_product')

    return get_great_product.info.get(pokemon_id)


def get_ultra_product(pokemon_id):
    if not hasattr(get_ultra_product, 'info'):
        get_ultra_product.info = {}
        file_ = 'static/data/base_stats.json'
        with open(file_, 'r') as f:
            j = json.loads(f.read())
        for id_ in j:
            get_ultra_product.info[int(id_)] = j[id_].get('2500_product')

    return get_ultra_product.info.get(pokemon_id)


def calculate_cp(monster, atk, de, sta, lvl):
    multipliers = get_cp_multipliers()
    base_stats = get_base_stats(int(monster))
    lvl = str(lvl).replace(".0", "")
    cp = ((base_stats["attack"] + atk) * sqrt(base_stats["defense"] + de) *
          sqrt(base_stats["stamina"] + sta) * (multipliers[str(lvl)] ** 2)
          / 10)
    return int(cp)


def max_cp(monster):
    return calculate_cp(monster, 15, 15, 15, 50)


def pokemon_rating(limit, monster, atk, de, sta, min_level, max_level):
    multipliers = get_cp_multipliers()
    base_stats = get_base_stats(int(monster))
    highest_rating = 0
    highest_cp = 0
    highest_level = 0
    for level in range(int(min_level * 2), int((max_level + 0.5) * 2)):
        level = str(level / float(2)).replace(".0", "")
        cp = calculate_cp(monster, atk, de, sta, level)
        if not cp > limit:
            attack = (base_stats["attack"] + atk) * multipliers[str(level)]
            defense = (base_stats["defense"] + de) * multipliers[str(level)]
            stamina = int(((base_stats["stamina"] + sta) *
                           (multipliers[str(level)])))
            product = attack * defense * stamina
            if product > highest_rating:
                highest_rating = product
                highest_cp = cp
                highest_level = level
    return highest_rating, highest_cp, highest_level


def max_level(limit, monster):
    if not max_cp(monster) > limit:
        return float(50)
    for x in range(100, 2, -1):
        x = (x * 0.5)
        if calculate_cp(monster, 0, 0, 0, x) <= limit:
            return min(x + 1, 50)


def get_mon_level(cp_multiplier):
    if cp_multiplier < 0.734:
        pokemonLevel = (58.35178527 * cp_multiplier * cp_multiplier - 2.838007664 * cp_multiplier + 0.8539209906)
    else:
        pokemonLevel = 171.0112688 * cp_multiplier - 95.20425243

    return round(pokemonLevel) * 2 / 2


def min_level(limit, monster):
    if not max_cp(monster) > limit:
        return float(50)
    for x in range(100, 2, -1):
        x = (x * 0.5)
        if calculate_cp(monster, 15, 15, 15, x) <= limit:
            return max(x - 1, 1)


def get_pvp_info(monster_id, atk, de, sta, lvl):
    monster = '{:03}'.format(monster_id)

    lvl = float(lvl)
    stats_great_product = get_great_product(monster_id)
    stats_ultra_product = get_ultra_product(monster_id)
    evolutions = get_evolutions(monster_id)

    great_product, great_cp, great_level = pokemon_rating(
        1500, monster, atk, de, sta, min_level(1500, monster),
        max_level(1500, monster))
    great_rating = 100 * (great_product / stats_great_product)
    ultra_product, ultra_cp, ultra_level = pokemon_rating(
        2500, monster, atk, de, sta, min_level(2500, monster),
        max_level(2500, monster))
    ultra_rating = 100 * (ultra_product / stats_ultra_product)
    great_id = monster_id
    ultra_id = monster_id

    if float(great_level) < lvl:
        great_rating = 0
    if float(ultra_level) < lvl:
        ultra_rating = 0

    for evolution in evolutions:
        evolution_id = int(evolution)
        stats_great_product = get_great_product(evolution_id)
        stats_ultra_product = get_ultra_product(evolution_id)

        great_product, evo_great_cp, evo_great_level = pokemon_rating(
            1500, evolution, atk, de, sta, min_level(1500, evolution),
            max_level(1500, evolution))
        ultra_product, evo_ultra_cp, evo_ultra_level = pokemon_rating(
            2500, evolution, atk, de, sta, min_level(2500, evolution),
            max_level(2500, evolution))
        evo_great = 100 * (great_product / stats_great_product)
        evo_ultra = 100 * (ultra_product / stats_ultra_product)

        if float(evo_great_level) < lvl:
            evo_great = 0
        if float(evo_ultra_level) < lvl:
            evo_ultra = 0

        if evo_great > great_rating:
            great_rating = evo_great
            great_cp = evo_great_cp
            great_level = evo_great_level
            great_id = evolution_id

        if evo_ultra > ultra_rating:
            ultra_rating = evo_ultra
            ultra_cp = evo_ultra_cp
            ultra_level = evo_ultra_level
            ultra_id = evolution_id

    return (float("{0:.2f}".format(great_rating)), great_id, great_cp,
            great_level, float("{0:.2f}".format(ultra_rating)), ultra_id,
            ultra_cp, ultra_level)
