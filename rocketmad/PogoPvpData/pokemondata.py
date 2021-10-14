import logging
import time
import requests
from . import Pokemon, EnumParser

logger = logging.getLogger(__name__)

EnumParser = EnumParser()
PokemonId = EnumParser.parseEnumProto("https://raw.githubusercontent.com/Furtif/POGOProtos/master/base/vbase.proto",
                                      "HoloPokemonId")
Form = EnumParser.parseEnumProto("https://raw.githubusercontent.com/Furtif/POGOProtos/master/base/vbase.proto", "Form")


class PokemonData():
    def __init__(self, ranklength, maxlevel, precalc=False):
        super(PokemonData, self).__init__()
        self.templates = None
        self.gmtime = None
        self._changed = False
        self.ranklength = ranklength
        self.maxlevel = maxlevel
        self.data = {}
#        self.EnumParser = EnumParser()
#        self.PokemonId = self.EnumParser.parseEnumProto("https://raw.githubusercontent.com/Furtif/POGOProtos/master/"
#                                                        "base/base.proto", "HoloPokemonId")
#        self.Form = self.EnumParser.parseEnumProto("https://raw.githubusercontent.com/Furtif/POGOProtos/master/base/"
#                                                   "base.proto", "Form")
        self.PokemonId = PokemonId
        self.Form = Form
        if precalc:
            logger.warning("initializing PokemonData, this will take a while ...")
            self.processGameMaster()

    def getGameMaster(self):
        logger.debug("getGameMaster called")
        if not self.templates or not self.gmtime or self.gmtime < int(time.time()) - 3600:
            logger.debug("download game master")
            gmfile = requests.get("https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json")
            self.templates = gmfile.json()
            self.gmtime = int(time.time())

    def processGameMaster(self, recalcIds: list = []):
        self.getGameMaster()
        if recalcIds:
            logger.debug(f"trying to calculate {recalcIds}")

        i = 0
        for template in self.templates:
            if (template["templateId"] and template["templateId"].startswith("V")
                    and not template["templateId"].startswith("VS") and "POKEMON" in template["templateId"]
                    and "HOME_FORM_REVERSION" not in template["templateId"]
                    and "HOME_REVERSION" not in template["templateId"]
                    and "pokemonSettings" in template["data"] and "stats" in template["data"]["pokemonSettings"]
                    and "baseAttack" in template["data"]["pokemonSettings"]["stats"]):
                if i > 0 and i % 50 == 0 and not recalcIds:
                    logger.info(f"processed {i} pokemon templates ...")
                i += 1
                try:
                    moninfo = template["data"]["pokemonSettings"]
                    stats = moninfo["stats"]
                    evolution = []
                    if "evolutionBranch" in moninfo:
                        try:
                            count = 0
                            for evo in moninfo["evolutionBranch"]:
                                params = {}
                                params["count"] = count
                                if "genderRequirement" in evo:
                                    params["genderRequirement"] = evo["genderRequirement"]
                                logger.debug(f"parsing evolution info {evo}")
                                evoId = self.PokemonId[evo["evolution"]].value
                                try:
                                    formId = self.Form[evo["form"]].value
                                except Exception:
                                    try:
                                        formId = self.Form["{}_NORMAL".format(evo["evolution"])].value
                                    except Exception:
                                        logger.debug(f"fallback to formId 0 for evolution {evoId}")
                                        formId = 0
                                evolution.append(("{}-{}".format(evoId, formId), params))
                                count += 1
                        except KeyError as e:
                            logger.debug(f"keyerror parsing evolution info: {e}")
                            evolution = []
                    else:
                        logger.debug("no evolution info found")

                    form = 0
                    if "form" in moninfo:
                        try:
                            form = self.Form[moninfo["form"]].value
                        except KeyError:
                            pass
                    if form == 0:
                        candidates = [moninfo["pokemonId"].replace("_FEMALE", "").replace("_MALE", "") + "_NORMAL",
                                      moninfo["pokemonId"].replace("_FEMALE", "").replace("_MALE", "")]
                        for name in candidates:
                            try:
                                form = self.Form["{}".format(name)].value
                                break
                            except KeyError:
                                form = 0

                    if form == 0 and not recalcIds:
                        logger.warning(f"Unable to determine form ID for template {template['templateId']} - fall "
                                       "back to 0")

                    if not recalcIds or (recalcIds and str(self.PokemonId[moninfo["pokemonId"]].value) in recalcIds):
                        logger.debug(f"calculating {self.PokemonId[moninfo['pokemonId']].value}-{form}")
                        mon = Pokemon(self.PokemonId[moninfo["pokemonId"]].value,
                                      form,
                                      stats["baseAttack"],
                                      stats["baseDefense"],
                                      stats["baseStamina"],
                                      evolution,
                                      self.ranklength,
                                      self.maxlevel)
                        self.add(mon)
                        logger.debug(f"processed template {template['templateId']}")
                    else:
                        logger.debug(f"skipped template {template['templateId']}")
                except Exception as e:
                    logger.warning(f"Exception processing template {template['templateId']}: {e} (this is probably ok)")
                    continue
            else:
                continue

    def add(self, pokemon: Pokemon):
        self._changed = True
        logger.debug(f"added {pokemon.ident()}")
        self.data[pokemon.ident()] = pokemon

    def is_changed(self):
        return self._changed

    def saved(self):
        self._changed = False

    def __str__(self):
        return str(self.data)

    def getUniqueIdentifier(self, mon, form):
        return "{}-{}".format(mon, form)

    def getPokemonObject(self, mon, form):
        identifier = self.getUniqueIdentifier(mon, form)
        if identifier in self.data:
            return self.data[identifier]
        else:
            logger.warning(f"mon {mon} form {form} not in data. Trying to calculate it ...")
            self.processGameMaster(recalcIds=[str(mon), ])
            time.sleep(1)
            if identifier in self.data:
                logger.info(f"Successfully calculated and added mon {mon} to data")
                return self.data[identifier]
            else:
                logger.error(f"Unable to find or calculate mon {mon} form {form}. Please try a full recalc or notify "
                             "the dev :)")
            return False

    def getAllEvolutions(self, mon, form, gender=None):
        allEvolutions = []
        logger.debug(f"passed gender {gender} to getAllEvolutions")
        try:
            nextEvolution = self.getPokemonObject(mon, form).getEvolution()
        except Exception:
            nextEvolution = False
        while nextEvolution:
            for evolution in nextEvolution:
                if gender and "genderRequirement" in evolution[1]:
                    parsedRequirements = True
                    logger.debug(f"evaluating mon gender {gender} against genderRequirement "
                                 f"{evolution[1]['genderRequirement']}")
                    if ((evolution[1]["genderRequirement"] == "MALE" and gender != 1)
                            or (evolution[1]["genderRequirement"] == "FEMALE" and gender != 2)):
                        logger.debug(f"skip evolution {evolution} because of failed gender requirement.")
                        continue
                else:
                    parsedRequirements = False
                allEvolutions.append(evolution)
                identifier = evolution[0] if type(evolution) is tuple else evolution
                furtherEvolutions = self.getAllEvolutions(identifier.split("-")[0], identifier.split("-")[1],
                                                          gender)
                allEvolutions = allEvolutions + furtherEvolutions
                # it seems the possible evolutions in game master are ordered and the first one meeting all criteria
                # is the one that will be available in game - thus if we did not <continue> previously but parsed some
                # requirements, we now found the primary evolution and have to skip possible others
                if parsedRequirements:
                    logger.debug("Found the evolution meeting additional requirements - skip others")
                    break
            try:
                nextEvolution = self.data[nextEvolution].getEvolution()
            except Exception:
                nextEvolution = False
        logger.debug(f"found evolutions: {allEvolutions}")
        return allEvolutions

    def getBaseStats(self, mon, form):
        mon = self.getPokemonObject(mon, form)
        stats = {}
        stats["attack"] = mon.atk
        stats["defense"] = mon.de
        stats["stamina"] = mon.sta
        return stats

    def get_pvp_info(self, atk, de, sta, lvl, monster=0, form=0, identifier=None):
        if identifier:
            monster = identifier.split("-")[0]
            form = identifier.split("-")[1]
        elif monster != 0 and form != 0:
            pass
        else:
            return False, False, False, False, False, False, False, False, False, False

        mondata = self.getPokemonObject(monster, form)

        if not mondata:
            return 0, 0, 0, 0, 4096, 0, 0, 0, 0, 4096

        lvl = float(lvl)
        stats_great_product = mondata.greatPerfect["product"]
        stats_ultra_product = mondata.ultraPerfect["product"]

        great_product, great_cp, great_level, great_rank = mondata.pokemon_rating(1500, atk, de, sta, lvl)
        great_rating = 100 * (great_product / stats_great_product)
        ultra_product, ultra_cp, ultra_level, ultra_rank = mondata.pokemon_rating(2500, atk, de, sta, lvl)
        ultra_rating = 100 * (ultra_product / stats_ultra_product)
        great_id = monster
        ultra_id = monster

        return (great_rating, great_id, great_cp, great_level, great_rank,
                ultra_rating, ultra_id, ultra_cp, ultra_level, ultra_rank)

    def getPoraclePvpInfo(self, mon, form, atk, de, sta, lvl, gender=None):
        if form == 0:
            try:
                form = self.Form["{}_NORMAL".format(self.PokemonId(str(mon)).name)].value
            except KeyError:
                form = 0
        greatPayload = []
        ultraPayload = []
        # evolution is a tuple containing a "mon-id" string as produced by getUniqueIdentifier
        # and a dict of possible additional parameters
        evolutions = [(self.getUniqueIdentifier(mon, form), {}), ] + self.getAllEvolutions(mon, form, gender)

        logger.debug(f"Found possible evolutions: {evolutions}")
        for evolution in evolutions:
            logger.debug(f"Getting data for evolution: {evolution}")
            identifier = evolution[0] if type(evolution) is tuple else evolution
            grating, gid, gcp, glvl, grank, urating, uid, ucp, ulvl, urank = self.get_pvp_info(atk, de, sta, lvl,
                                                                                               identifier=identifier)
            if grank < 4096:
                greatPayload.append(
                    {
                        'rank': grank,
                        'percentage': round(grating, 3),
                        'pokemon': identifier.split("-")[0],
                        'form': identifier.split("-")[1],
                        'level': glvl,
                        'cp': gcp
                    })
            if urank < 4096:
                ultraPayload.append(
                    {
                        'rank': urank,
                        'percentage': round(urating, 3),
                        'pokemon': identifier.split("-")[0],
                        'form': identifier.split("-")[1],
                        'level': ulvl,
                        'cp': ucp
                    })
        return greatPayload, ultraPayload
