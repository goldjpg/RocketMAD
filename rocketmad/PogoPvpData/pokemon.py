import itertools
import json
import logging
import os
from math import sqrt, floor


logger = logging.getLogger(__name__)


class Pokemon():
    def __init__(self, num: int, form: int, atk: int, de: int, sta: int,
                 evolutions: list, ranklength: int, maxlevel: int):
        super(Pokemon, self).__init__()
        self.num = num
        self.form = form
        self.atk = atk
        self.de = de
        self.sta = sta
        self.evolutions = evolutions
        self.ranklength = ranklength
        self.maxlevel = maxlevel
        with open("{}/cp_multipliers.json".format(os.path.dirname(os.path.abspath(__file__))), "r") as f:
            self.cp_multipliers = json.load(f)

        self.products = {}
        self.greatPerfect, self.greatLowest = self._spreads(1500)
        self.ultraPerfect, self.ultraLowest = self._spreads(2500)
        logger.debug("Pokemon {}, form {} initialized".format(self.num, self.form))

    def num(self):
        return int(self.num)

    def form(self):
        return int(self.form)

    def ident(self):
        return str("{}-{}".format(self.num, self.form))

    def __str__(self):
        return "{{'num': {}, 'form': {}, 'atk': {}, 'de': {}, 'sta': {}, 'evolutions': {}}}".format(
            self.num, self.form, self.atk, self.de, self.sta, self.evolutions)

    def calculate_cp(self, atk, de, sta, lvl):
        lvl = str(lvl).replace(".0", "")
        cp = ((self.atk + atk) * sqrt(self.de + de) * sqrt(self.sta + sta) * (self.cp_multipliers[str(lvl)]**2) / 10)
        return int(cp)

    def max_cp(self):
        return self.calculate_cp(15, 15, 15, self.maxlevel)

    def getEvolution(self):
        if self.evolutions:
            logger.debug("getEvolution returning {}".format(self.evolutions))
            return self.evolutions
        else:
            return False

    def pokemon_rating(self, limit, atk, de, sta, lvl):
        highest_rating = 0
        highest_cp = 0
        highest_level = 0
        highest_product = 0
        rank = 4096
        min_level = max(self.min_level(limit), lvl)
        max_level = self.max_level(limit)

        if min_level > max_level:
            return 0, 0, 0, 4096

        for level in range(int(min_level * 2), int((max_level + 0.5) * 2)):
            level = str(level / float(2)).replace(".0", "")
            cp = self.calculate_cp(atk, de, sta, level)
            if not cp > limit:
                attack = (self.atk + atk) * self.cp_multipliers[str(level)]
                defense = (self.de + de) * self.cp_multipliers[str(level)]
                stamina = int(((self.sta + sta) * (self.cp_multipliers[str(level)])))
                product = attack * defense * stamina
                if product > highest_rating:
                    highest_rating = product
                    highest_cp = cp
                    highest_level = level
                    highest_product = product
        try:
            rank = self.products[limit].index(highest_product) + 1
        except Exception:
            rank = 4096
        return highest_rating, highest_cp, highest_level, rank

    def max_level(self, limit):
        if not self.max_cp() > limit:
            return float(self.maxlevel)
        for x in range(self.maxlevel * 2, 2, -1):
            x = (x * 0.5)
            if self.calculate_cp(0, 0, 0, x) <= limit:
                return min(x + 1, self.maxlevel)

    def min_level(self, limit):
        if not self.max_cp() > limit:
            return float(self.maxlevel)
        for x in range(self.maxlevel * 2, 2, -1):
            x = (x * 0.5)
            if self.calculate_cp(15, 15, 15, x) <= limit:
                return max(x - 1, 1)

    def _spreads(self, limit):
        smallest = {"product": 999999999}
        highest = {"product": 0}
        if limit not in self.products:
            self.products[limit] = []

        min_level = self.min_level(limit)
        max_level = self.max_level(limit)

        for level in range(int(min_level * 2), int((max_level + 0.5) * 2)):
            level = str(level / 2).replace('.0', '')

            for stat_product in itertools.product(range(16), range(16), range(16)):
                cp = self.calculate_cp(stat_product[0], stat_product[1], stat_product[2], level)
                if cp > limit:
                    continue

                attack = ((self.atk + stat_product[0]) * (
                    self.cp_multipliers[str(level)]))
                defense = ((self.de + stat_product[1]) * (
                    self.cp_multipliers[str(level)]))
                stamina = floor(((self.sta + stat_product[2]) * (
                    self.cp_multipliers[str(level)])))
                product = (attack * defense * stamina)
                self.products[limit].append(product)
                if product > highest["product"]:
                    highest.update({
                        'product': product,
                        'attack': attack,
                        'defense': defense,
                        'stamina': stamina,
                        'atk': stat_product[0],
                        'de': stat_product[1],
                        'sta': stat_product[2],
                        'cp': cp,
                        'level': level
                    })
                if product < smallest["product"]:
                    smallest.update({
                        'product': product,
                        'attack': attack,
                        'defense': defense,
                        'stamina': stamina,
                        'atk': stat_product[0],
                        'de': stat_product[1],
                        'sta': stat_product[2],
                        'cp': cp,
                        'level': level
                    })
        self.products[limit].sort(reverse=True)
        del self.products[limit][self.ranklength:]
        return highest, smallest
