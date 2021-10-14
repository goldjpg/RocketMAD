import configparser
import requests
import os
from enum import Enum


class EnumParser():
    def parseEnumProto(self, url, name):
        r = requests.get(url)
        enumDict = {}
        found = False
        internalName = "enum {}".format(name)
        for line in r.iter_lines(decode_unicode=True):
            if not found:
                if internalName in line:
                    found = True
                continue
            if not line.startswith("syntax") and not line.startswith("package") and "=" in line:
                enumDict[line.split("=")[0].strip()] = line.split("=")[1].replace(";", "").strip()
            if "}" in line:
                break
        enumDict = self.addEnumInfo(name, enumDict)
        resultingEnum = Enum(name.replace("Holo", ""), enumDict)
        globals()[name.replace("Holo", "")] = resultingEnum
        return resultingEnum

    def addEnumInfo(self, name, enumDict):
        additionalInfo = configparser.ConfigParser()
        additionalInfo.read(os.path.dirname(os.path.abspath(__file__)) + "/additional-enum-info.ini")
        if name in additionalInfo:
            for elem in additionalInfo[name]:
                enumDict[elem.upper()] = additionalInfo[name][elem]
        return enumDict
