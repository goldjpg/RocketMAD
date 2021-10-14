import json
import os
import pickle
from math import sqrt
import logging

from rocketmad.PogoPvpData import PokemonData
from rocketmad.utils import calc_pokemon_level

log = logging.getLogger('PvpUtils')

MAX_LEVEL = 50
data = None


def pickle_data(data):
    try:
        with open("data.pickle", "wb") as datafile:
            pickle.dump(data, datafile, -1)
            log.info("Saved data to pickle file")
            return True
    except Exception as e:
        log.warning("Failed saving to pickle file: {}".format(e))
        return False


def load_data(precalc=False):
    global data
    try:
        with open("data.pickle", "rb") as datafile:
            data = pickle.load(datafile)
    except Exception as e:
        log.debug("exception trying to load pickle'd data: {}".format(e))
        add_string = " - start initialization" if precalc else " - will calculate as needed"
        log.warning(f"Failed loading previously calculated data{add_string}")
        data = None

    if not data:
        data = PokemonData(100, MAX_LEVEL, precalc=precalc)
        pickle_data(data)
        return True

    if not data:
        log.error("Failed aquiring PokemonData object! Stopping the plugin.")
        return False


def get_pvp_info(monster_id, form, atk, de, sta, cp_modifier, gender):
    global data
    if data:
        if data.is_changed():
            pickle_data(data)
            data.saved()
        log.info(str(monster_id) +", "+ str(form) +", "+ str(atk) +", "+ str(de)+", "+ str(sta)+", "+ str(calc_pokemon_level(cp_modifier))+", "+ str(gender))
        return data.getPoraclePvpInfo(monster_id, form, atk, de, sta, calc_pokemon_level(cp_modifier), gender)
    else:
        return None, None
