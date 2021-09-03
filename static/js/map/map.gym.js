/*
globals autoPanPopup, $gymNameFilter, addListeners, gymEggZIndex,
gymNotifiedZIndex, gymRaidBossZIndex, gymSidebar, gymZIndex, mapData,
notifiedGymData, openGymSidebarId:writable, raidIds,
removeMarker, removeRangeCircle, settings, sendNotification, setupRangeCircle,
upcomingRaidIds, updateRangeCircle, updateMarkerLayer, filterManagers
*/
/* exported processGym, readdGymMarkers, updateGyms */

function isGymMeetsGymFilters(gym) {
    if (!settings.showGyms) {
        return false
    }

    if (serverSettings.gymFilters) {
        if ($gymNameFilter) {
            const gymRegex = new RegExp($gymNameFilter, 'gi')
            if (!gym.name.match(gymRegex)) {
                return false
            }
        }

        if (!settings.includedGymTeams.includes(gym.team_id)) {
            return false
        }

        const gymLevel = getGymLevel(gym)
        if (gymLevel < settings.minGymLevel || gymLevel > settings.maxGymLevel) {
            return false
        }

        if (settings.showOpenSpotGymsOnly && gym.slots_available === 0) {
            return false
        }

        if (settings.showExGymsOnly && !gym.is_ex_raid_eligible) {
            return false
        }

        if (settings.showInBattleGymsOnly && !gym.is_in_battle) {
            return false
        }

        if (settings.gymLastScannedHours > 0 && gym.last_scanned < Date.now() - settings.gymLastScannedHours * 3600 * 1000) {
            return false
        }
    }

    return true
}

function isGymMeetsRaidFilters(gym) {
    const raid = gym.raid

    if (!settings.showRaids || !isValidRaid(raid)) {
        return false
    }

    if (serverSettings.raidFilters) {
        if ($gymNameFilter) {
            const gymRegex = new RegExp($gymNameFilter, 'gi')
            if (!gym.name.match(gymRegex)) {
                return false
            }
        }

        if (isUpcomingRaid(raid)) {
            if (settings.showActiveRaidsOnly) {
                return false
            }
        } else { // Ongoing raid.
            if (raid.pokemon_id && settings.filterRaidPokemon && settings.excludedRaidPokemon.has(raid.pokemon_id)) {
                return false
            }
        }

        if (!settings.includedRaidLevels.includes(raid.level)) {
            return false
        }

        if (settings.showExEligibleRaidsOnly && !gym.is_ex_raid_eligible) {
            return false
        }
    }

    return true
}

function isGymMeetsFilters(gym) {
    return isGymMeetsGymFilters(gym) || isGymMeetsRaidFilters(gym)
}

function isGymRangesActive() {
    return settings.showRanges && settings.includedRangeTypes.includes(2)
}

function setupGymMarker(gym, isNotifGym) {
    const marker = L.marker([gym.latitude, gym.longitude])

    marker.setBouncingOptions({
        bounceHeight: 20,
        bounceSpeed: 80,
        elastic: false,
        shadowAngle: null
    })

    marker.gym_id = gym.gym_id
    updateGymMarker(gym, marker, isNotifGym)
    if (!settings.useGymSidebar) {
        marker.bindPopup('', { autoPan: autoPanPopup() })
    }

    if (settings.useGymSidebar) {
        marker.on('click', function () {
            if (gymSidebar.isOpen && openGymSidebarId === gym.gym_id) {
                gymSidebar.close()
            } else {
                updateGymSidebar(gym.gym_id)
                if (!gymSidebar.isOpen) {
                    gymSidebar.open()
                }
                openGymSidebarId = gym.gym_id
            }
        })
    } else {
        addListeners(marker, 'gym')
    }

    return marker
}

function updateGymMarker(gym, marker, isNotifGym) {
    let markerImage = ''
    const upscaleModifier = isNotifGym && settings.upscaleNotifMarkers ? 1.2 : 1
    const gymLevel = getGymLevel(gym)

    if (isGymMeetsRaidFilters(gym)) {
        const raid = gym.raid
        if (isOngoingRaid(raid) && raid.pokemon_id !== null) {
            markerImage = 'gym_img?team=' + gymTypes[gym.team_id] + '&level=' + gymLevel + '&raid-level=' + raid.level + '&pkm=' + raid.pokemon_id
            if (raid.form != null && raid.form > 0) {
                markerImage += '&form=' + raid.form
            }
            if (raid.costume != null && raid.costume > 0) {
                markerImage += '&costume=' + raid.costume
            }
            if (raid.evolution != null && raid.evolution > 0) {
                markerImage += '&evolution=' + raid.evolution
            }
            marker.setZIndexOffset(gymRaidBossZIndex)
        } else { // Upcoming raid.
            markerImage = 'gym_img?team=' + gymTypes[gym.team_id] + '&level=' + gymLevel + '&raid-level=' + raid.level
            marker.setZIndexOffset(gymEggZIndex)
        }
    } else {
        markerImage = 'gym_img?team=' + gymTypes[gym.team_id] + '&level=' + gymLevel
        marker.setZIndexOffset(gymZIndex)
    }

    if (gym.is_in_battle) {
        markerImage += '&in-battle=1'
    }

    if (gym.is_ex_raid_eligible) {
        markerImage += '&ex-raid-eligible=1'
    }

    const icon = L.contentIcon({
        iconUrl: markerImage,
        iconSize: [48 * upscaleModifier, 48 * upscaleModifier]
    })
    marker.setIcon(icon)

    if (isNotifGym) {
        marker.setZIndexOffset(gymNotifiedZIndex)
    }

    updateMarkerLayer(marker, isNotifGym, notifiedGymData[gym.gym_id])

    return marker
}

function updateGymSidebar(id) {
    const gym = mapData.gyms[id]

    const teamName = gymTypes[gym.team_id]
    const title = gym.name !== null && gym.name !== '' ? gym.name : (gym.team_id === 0 ? teamName : teamName + ' Gym')
    let exIcon = ''
    if (gym.is_ex_raid_eligible) {
        exIcon += ` <img id="sidebar-gym-ex-icon" src="static/images/gym/ex.png" title="${i18n('EX eligible Gym')}">`
    }

    $('#sidebar-gym-title').html(title + exIcon)

    const $image = $('#sidebar-gym-image')
    if (gym.url) {
        const url = gym.url.replace(/^http:\/\//i, '//')
        $image.attr('src', url)
        $image.attr('class', 'gym-image')
        $image.addClass(teamName.toLowerCase())
        $image.attr('onclick', `showImageModal('${url}', '${title.replace(/"/g, '\\&quot;').replace(/'/g, '\\&#39;')}')`)
    } else {
        let url = `gym_img?team=${teamName}&level=${getGymLevel(gym)}`
        if (gym.is_in_battle) {
            url += '&in_battle=1'
        }
        $image.removeClass('gym-image')
        $image.removeAttr('onclick')
        $image.attr('src', url)
    }

    const $team = $('#gym-sidebar .team')
    if (gym.slots_available < 6) {
        $team.text(i18n('Team ' + teamName))
    } else {
        $team.text(i18n(teamName))
    }
    $team.attr('class', 'team')
    $team.addClass(teamName.toLowerCase())

    $('#sidebar-gym-free-slots').text(gym.slots_available)
    if (gym.slots_available < 6) {
        $('#sidebar-gym-leader').html(`${getPokemonName(gym.guard_pokemon_id)} <a href='https://pokemongo.gamepress.gg/pokemon/${gym.guard_pokemon_id}' target='_blank' title='${i18n('View on GamePress')}'>#${gym.guard_pokemon_id}</a>`)
        $('#sidebar-gym-leader-container').show()
    } else {
        $('#sidebar-gym-leader-container').hide()
    }
    $('#sidebar-gym-last-scanned').text(timestampToDateTime(gym.last_scanned))
    $('#sidebar-gym-last-modified').text(timestampToDateTime(gym.last_modified))
    $('#sidebar-gym-coordinates-container').html(`<a href='javascript:void(0);' onclick='javascript:openMapDirections(${gym.latitude},${gym.longitude},"${settings.mapServiceProvider}");' title='${i18n('Open in')} ${mapServiceProviderNames[settings.mapServiceProvider]}'><i class="fas fa-map-marked-alt"></i> ${gym.latitude.toFixed(5)}, ${gym.longitude.toFixed(5)}</a>`)

    if (isGymMeetsRaidFilters(gym)) {
        const raid = gym.raid
        const levelStars = '★'.repeat(raid.level)

        if (isOngoingRaid(raid) && raid.pokemon_id) {
            const name = getPokemonNameWithForm(raid.pokemon_id, raid.form, raid.evolution)
            const fastMoveName = getMoveName(raid.move_1)
            const chargeMoveName = getMoveName(raid.move_2)
            const fastMoveType = getMoveTypeNoI8ln(raid.move_1)
            const chargeMoveType = getMoveTypeNoI8ln(raid.move_2)

            $('#sidebar-upcoming-raid-container').hide()
            $('#sidebar-ongoing-raid-title').html(`${name} <i class='fas ${genderClasses[raid.gender - 1]}'></i> #${raid.pokemon_id}`)
            $('#sidebar-ongoing-raid-level-container').html(`${i18n('Raid')} <span class='raid-level-${raid.level}'>${levelStars}</span>`)
            $('#sidebar-ongoing-raid-end-container').html(`${timestampToTime(raid.end)} (<span class='label-countdown' disappears-at='${raid.end}'>00m00s</span>)`)
            $('#sidebar-raid-pokemon-image').attr('src', getPokemonRawIconUrl(raid, serverSettings.generateImages))

            let typesDisplay = ''
            const types = getPokemonTypesNoI8ln(raid.pokemon_id, raid.form)
            $.each(types, function (index, type) {
                if (index === 1) {
                    typesDisplay += `<img src='static/images/types/${type.type.toLowerCase()}.png' title='${i18n(type.type)}' width='24' style='margin-left:4px;'>`
                } else {
                    typesDisplay += `<img src='static/images/types/${type.type.toLowerCase()}.png' title='${i18n(type.type)}' width='24'>`
                }
            })
            $('#sidebar-raid-types-container').html(typesDisplay)

            $('#sidebar-raid-cp').text(raid.cp)
            $('#sidebar-raid-fast-move').html(`${fastMoveName} <img class='move-type-icon' src='static/images/types/${fastMoveType.toLowerCase()}.png' title='${i18n(fastMoveType)}' width='15'>`)
            $('#sidebar-raid-charge-move').html(`${chargeMoveName} <img class='move-type-icon' src='static/images/types/${chargeMoveType.toLowerCase()}.png' title='${i18n(chargeMoveType)}' width='15'>`)
            $('#sidebar-ongoing-raid-container').show()
        } else {
            $('#sidebar-ongoing-raid-container').hide()
            $('#sidebar-upcoming-raid-title').html(`${i18n('Raid')} <span class='raid-level-${raid.level}'>${levelStars}</span>`)
            $('#sidebar-raid-egg-image').attr('src', 'static/images/gym/' + raidEggImages[raid.level])
            $('#sidebar-upcoming-raid-start-container').html(`${i18n('Start')}: ${timestampToTime(raid.start)} (<span class='label-countdown' disappears-at='${raid.start}'>00m00s</span>)`)
            $('#sidebar-upcoming-raid-end-container').html(`${i18n('End')}: ${timestampToTime(raid.end)} (<span class='label-countdown' disappears-at='${raid.end}'>00m00s</span>)`)
            $('#sidebar-upcoming-raid-container').show()
        }
        // Update countdown time to prevent a countdown time of 0.
        updateLabelDiffTime()
    } else {
        $('#sidebar-ongoing-raid-container').hide()
        $('#sidebar-upcoming-raid-container').hide()
    }
    if (serverSettings.gymsMember && gym.slots_available < 6) {
        $('#sidebar-gymmember-loading-spinner').show()
        $('#sidebar-gymmember-bottom-divider').show()
        for (var i = 5; i >= 0; i--) {
            $('#sidebar-gymmember-container' + (i)).hide()
        }
        var data = $.ajax({
            url: 'get-gym',
            type: 'GET',
            data: {
                id: id
            },
            dataType: 'json',
            cache: false
        })
        data.done(function (result) {
            if (result.length) {
                result.forEach((pokemon, index) => {
                    updatesidebargymmember(pokemon, index)
                })
            }
            for (var i = 6; i > result.length; i--) {
                $('#sidebar-gymmember-container' + (i - 1)).hide()
            }
            if (result.length === 0) {
                $('#sidebar-gymmember-bottom-divider').hide()
            }
            $('#sidebar-gymmember-loading-spinner').hide()
        })
        data.fail(function (result) {
            $('#sidebar-gymmember-loading-spinner').hide()
        })
    } else {
        for (var i2 = 5; i2 >= 0; i2--) {
            $('#sidebar-gymmember-container' + (i2)).hide()
        }
        $('#sidebar-gymmember-bottom-divider').hide()
        $('#sidebar-gymmember-loading-spinner').hide()
    }
}

function updatesidebargymmember(pokemon, count) {
    $('#sidebar-gymmember-container' + count).show()
    var name = getPokemonName(pokemon.pokemon_id)
    if (pokemon.nickname != null) {
        name += ' (' + pokemon.nickname + ')'
    }
    const fastMoveName = getMoveName(pokemon.move_1)
    const chargeMoveName = getMoveName(pokemon.move_2)
    const fastMoveType = getMoveTypeNoI8ln(pokemon.move_1)
    const chargeMoveType = getMoveTypeNoI8ln(pokemon.move_2)

    $('#sidebar-gymmember-title' + count).html(`${name}`)
    if (serverSettings.gymsTrainer) {
        $('#sidebar-gymmember-trainername-container' + count).html(`${i18n('Trainer')} ${pokemon.trainer}`)
    }
    $('#sidebar-gymmember-wpinfo-container' + count).html(`${i18n('CP')} ${pokemon.cp_now}`)
    $('#sidebar-gymmember-pokemon-image' + count).attr('src', getPokemonRawIconUrl(pokemon, serverSettings.generateImages))
    let typesDisplay = ''
    const types = getPokemonTypesNoI8ln(pokemon.pokemon_id, pokemon.form)
    $.each(types, function (index, type) {
        if (index === 1) {
            typesDisplay += `<img src='static/images/types/${type.type.toLowerCase()}.png' title='${i18n(type.type)}' width='24' style='margin-left:4px;'>`
        } else {
            typesDisplay += `<img src='static/images/types/${type.type.toLowerCase()}.png' title='${i18n(type.type)}' width='24'>`
        }
    })
    $('#sidebar-gymmember-types-container' + count).html(typesDisplay)
    $('#sidebar-gymmember-fast-move' + count).html(`${fastMoveName} <img class='move-type-icon' src='static/images/types/${fastMoveType.toLowerCase()}.png' title='${i18n(fastMoveType)}' width='15'>`)
    $('#sidebar-gymmember-charge-move' + count).html(`${chargeMoveName} <img class='move-type-icon' src='static/images/types/${chargeMoveType.toLowerCase()}.png' title='${i18n(chargeMoveType)}' width='15'>`)
    $('#sidebar-gymmember-deployed' + count).text(timestampToDateTime(pokemon.deployed))
    $('#sidebar-gymmember-battles-won' + count).html(`${pokemon.battles_won}`)
    $('#sidebar-gymmember-battles-lost' + count).html(`${pokemon.battles_lost}`)
    $('#sidebar-gymmember-times-fed' + count).html(`${pokemon.times_fed}`)
    if (pokemon.iv_attack != null && pokemon.iv_defense != null && pokemon.iv_stamina != null) {
        $('#sidebar-gymmember-iv' + count).html(`${pokemon.iv_attack}/${pokemon.iv_defense}/${pokemon.iv_stamina}`)
    } else {
        $('#sidebar-gymmember-iv' + count).html('&nbsp;')
    }
    $('#sidebar-gymmember-is-lucky' + count).html(`${getReadableData(pokemon.lucky)}`)
    $('#sidebar-gymmember-is-purified' + count).html(`${getReadableData(pokemon.purified)}`)
    $('#sidebar-gymmember-origin' + count).html(`${getReadableData(pokemon.origin)}`)
    $('#sidebar-gymmember-origin-event' + count).html(`${getReadableData(pokemon.origin_event)}`)
    if (serverSettings.gymsTrainer) {
        $('#sidebar-gymmember-traded-from' + count).html(`${getReadableData(pokemon.origin_traded_from)}`)
    }
    $('#sidebar-gymmember-battles-attacked' + count).html(`${pokemon.battles_attacked}`)
    $('#sidebar-gymmember-battles-defended' + count).html(`${pokemon.battles_defended}`)
    $('#sidebar-gymmember-pvp-won' + count).html(`${pokemon.pvp_won}`)
    $('#sidebar-gymmember-pvp-total' + count).html(`${pokemon.pvp_total}`)
    $('#sidebar-gymmember-npc-won' + count).html(`${pokemon.npc_won}`)
    $('#sidebar-gymmember-npc-total' + count).html(`${pokemon.npc_total}`)
    toggleGymPokemonData(count, true)
}

function getReadableData(input) {
    if (input === 1) {
        return i18n('Yes')
    } else if (input === 0) {
        return i18n('No')
    } else if (input == null) {
        return '&nbsp;'
    } else if (input === 'egg_detail') {
        return i18n('Egg')
    } else if (input === 'invasion_detail') {
        return i18n('Rocket grunt')
    } else if (input === 'wild_detail') {
        return i18n('Wild encounter')
    } else if (input === 'quest_detail') {
        return i18n('Quest reward')
    } else if (input === 'raid_detail') {
        return i18n('Raid encounter')
    } else if (input === 'vs_seeker_detail') {
        return i18n('PVP reward')
    } else if (input === 'photobomb_detail') {
        return i18n('Photobomb')
    } else {
        return i18n(input)
    }
}

function toggleGymPokemonData(index, hide) { // eslint-disable-line no-unused-vars
    if (hide) {
        $('#sidebar-gymmember-data-container' + index).hide()
        $('#sidebar-gymmember-data-toggle' + index).html(`${i18n('Show Pokémon Details')} <i class="fas fa-chevron-down"></i>`)
        $('#sidebar-gymmember-data-toggle' + index).attr('onclick', 'toggleGymPokemonData(' + index + ',false)')
    } else {
        $('#sidebar-gymmember-data-container' + index).show()
        $('#sidebar-gymmember-data-toggle' + index).html(`${i18n('Hide Pokémon Details')} <i class="fas fa-chevron-up"></i>`)
        $('#sidebar-gymmember-data-toggle' + index).attr('onclick', 'toggleGymPokemonData(' + index + ',true)')
    }
}

function gymLabel(gym) {
    const teamName = gymTypes[gym.team_id]
    const titleText = gym.name !== null && gym.name !== '' ? gym.name : (gym.team_id === 0 ? teamName : teamName + ' Gym')

    var exDisplay = ''
    var gymImageDisplay = ''
    var strenghtDisplay = ''
    var gymLeaderDisplay = ''
    var raidDisplay = ''

    if (gym.is_ex_raid_eligible) {
        exDisplay = '<img id="ex-icon" src="static/images/gym/ex.png" width="22" title="EX eligible Gym">'
    }

    if (gym.url) {
        const url = gym.url.replace(/^http:\/\//i, '//')
        gymImageDisplay = `
            <div>
              <img class='gym-image ${teamName.toLowerCase()}' src='${url}' onclick='showImageModal("${url}", "${titleText.replace(/"/g, '\\&quot;').replace(/'/g, '\\&#39;')}")' width='64' height='64'>
            </div>`
    } else {
        let gymUrl = `gym_img?team=${teamName}&level=${getGymLevel(gym)}`
        if (gym.is_in_battle) {
            gymUrl += '&in_battle=1'
        }
        gymImageDisplay = `
            <div>
              <img class='gym-icon' src='${gymUrl}' width='64'>
            </div>`
    }

    if (gym.team_id !== 0) {
        /* strenghtDisplay = `
        <div>
          Strength: <span class='info'>${gym.total_cp}</span>
        </div>` */

        gymLeaderDisplay = `
            <div>
              ${i18n('Gym leader')}: <strong>${getPokemonName(gym.guard_pokemon_id)} <a href='https://pokemongo.gamepress.gg/pokemon/${gym.guard_pokemon_id}' target='_blank' title='${i18n('View on GamePress')}'>#${gym.guard_pokemon_id}</a></strong>
            </div>`
    }

    if (isGymMeetsRaidFilters(gym)) {
        const raid = gym.raid
        const levelStars = '★'.repeat(raid.level)

        if (isOngoingRaid(raid) && raid.pokemon_id !== null) {
            const pokemonIconUrl = getPokemonRawIconUrl(raid, serverSettings.generateImages)

            let typesDisplay = ''
            const types = getPokemonTypesNoI8ln(raid.pokemon_id, raid.form)
            $.each(types, function (index, type) {
                if (index === 1) {
                    typesDisplay += `<img src='static/images/types/${type.type.toLowerCase()}.png' title='${i18n(type.type)}' width='16' style='margin-left:4px;'>`
                } else {
                    typesDisplay += `<img src='static/images/types/${type.type.toLowerCase()}.png' title='${i18n(type.type)}' width='16'>`
                }
            })

            const name = getPokemonNameWithForm(raid.pokemon_id, raid.form, raid.evolution)
            const fastMoveName = getMoveName(raid.move_1)
            const chargeMoveName = getMoveName(raid.move_2)
            const fastMoveType = getMoveTypeNoI8ln(raid.move_1)
            const chargeMoveType = getMoveTypeNoI8ln(raid.move_2)

            const isNotifRaid = settings.notifRaidPokemon.has(raid.pokemon_id)
            const notifText = isNotifRaid ? i18n('Don\'t notify') : i18n('Notify')
            const notifIconClass = isNotifRaid ? 'fas fa-bell-slash' : 'fas fa-bell'

            raidDisplay = `
                <div class='section-divider'></div>
                <div id='raid-container'>
                  <div id='raid-container-left'>
                    <div>
                      <img src='${pokemonIconUrl}' width='64px'>
                    </div>
                    <div>
                      ${typesDisplay}
                    </div>
                    <div>
                      <strong><span class='raid-level-${raid.level}'>${levelStars}</span></strong>
                    </div>
                  </div>
                  <div id='raid-container-right'>
                    <div class='title ongoing'>
                      <div>
                        ${i18n('Raid')}: ${name} <i class="fas ${genderClasses[raid.gender - 1]}"></i> #${raid.pokemon_id}
                      </div>
                    </div>
                    <div class='disappear'>
                      ${timestampToTime(raid.end)} (<span class='label-countdown' disappears-at='${raid.end}'>00m00s</span>)
                    </div>
                    <div class='info-container'>
                      <div>
                        ${i18n('CP')}: <strong>${raid.cp}</strong>
                      </div>
                      <div>
                        ${i18n('Fast')}: <strong>${fastMoveName}</strong> <img class='move-type-icon' src='static/images/types/${fastMoveType.toLowerCase()}.png' title='${i18n(fastMoveType)}' width='15'>
                      </div>
                      <div>
                        ${i18n('Charge')}: <strong>${chargeMoveName}</strong> <img class='move-type-icon' src='static/images/types/${chargeMoveType.toLowerCase()}.png' title='${i18n(chargeMoveType)}' width='15'>
                      </div>
                    </div>
                    <div>
                      <a href='javascript:toggleRaidPokemonNotif(${raid.pokemon_id})' class='link-button' title="${notifText}"><i class="${notifIconClass}"></i></a>
                      <a href='javascript:excludeRaidPokemon(${raid.pokemon_id})' class='link-button' title=${i18n('Hide')}><i class="fas fa-eye-slash"></i></a>
                      <a href='javascript:removeRaidMarker("${gym.gym_id}")' class='link-button' title=${i18n('Remove')}><i class="fas fa-trash"></i></a>
                      <a href='https://pokemongo.gamepress.gg/pokemon/${raid.pokemon_id}' class='link-button' target='_blank' title='${i18n('View on GamePress')}'><i class="fas fa-info-circle"></i></a>
                    </div>
                  </div>
                </div>`
        } else {
            const isNotifEgg = settings.notifEggs.includes(raid.level)
            const notifText = isNotifEgg ? i18n('Don\'t notify') : i18n('Notify')
            const notifIconClass = isNotifEgg ? 'fas fa-bell-slash' : 'fas fa-bell'

            raidDisplay = `
                <div class='section-divider'></div>
                <div id='raid-container'>
                  <div id='raid-container-left'>
                    <img id='egg-image' src='static/images/gym/${raidEggImages[raid.level]}' width='64'>
                  </div>
                  <div id='raid-container-right'>
                    <div class='title upcoming'>
                      Raid <span class='raid-level-${raid.level}'>${levelStars}</span>
                    </div>
                    <div class='info-container'>
                      <div>
                        ${i18n('Start')}: <strong>${timestampToTime(raid.start)} (<span class='label-countdown' disappears-at='${raid.start}'>00m00s</span>)</strong>
                      </div>
                      <div>
                        ${i18n('End')}: <strong>${timestampToTime(raid.end)} (<span class='label-countdown' disappears-at='${raid.end}'>00m00s</span>)</strong>
                      </div>
                    </div>
                    <div>
                      <a href='javascript:toggleEggNotif(${raid.level})' class='link-button' title="${notifText}"><i class="${notifIconClass}"></i></a>
                      <a href='javascript:excludeRaidLevel(${raid.level})' class='link-button' title=${i18n('Hide')}><i class="fas fa-eye-slash"></i></a>
                      <a href='javascript:removeRaidMarker("${gym.gym_id}")' class='link-button' title=${i18n('Remove')}><i class="fas fa-trash"></i></a>
                    </div>
                  </div>
                </div>`
        }
    }

    let pokemonDisplay = ''
    const panelid = gym.gym_id.replace('.', '')
    if (serverSettings.gymsMember && gym.slots_available < 6) {
        if (settings.showGymPokemon) {
            pokemonDisplay = `<div class='section-divider'></div><div class="gymmember-pokemon-toggle" onclick="toggleGymMarkerPokemonData(true,'${gym.gym_id}')" id="marker-gymmember-data-toggle${panelid}">${i18n('Hide Pokémon')} <i class="fas fa-chevron-up"></i></div><div class="gym-pokemon-container" id="marker-gymmember-data-container${panelid}">`
            pokemonDisplay += `<div class="preloader-wrapper big active" id="gym-marker-loading-spinner${panelid}">
             <div class="spinner-layer">
               <div class="circle-clipper left">
                 <div class="circle"></div>
               </div>
               <div class="gap-patch">
                   <div class="circle"></div>
               </div>
               <div class="circle-clipper right">
                 <div class="circle"></div>
               </div>
             </div>
           </div>`
            loadGymMemberForMarker(gym.gym_id, true)
        } else {
            pokemonDisplay = `<div class='section-divider'></div><div class="gymmember-pokemon-toggle" onclick="toggleGymMarkerPokemonData(false,'${gym.gym_id}')" id="marker-gymmember-data-toggle${panelid}">${i18n('Show Pokémon')} <i class="fas fa-chevron-down"></i></div><div class="gym-pokemon-container" style="display:none" id="marker-gymmember-data-container${panelid}">`
        }
        pokemonDisplay += '</div>'
    }

    return `
        <div id='gymlabel${panelid}'>
          <div id='gym-container'>
            <div id='gym-container-left'>
              ${gymImageDisplay}
              <div class='team ${teamName.toLowerCase()}'>
                <strong>${i18n(teamName)}</strong>
              </div>
            </div>
            <div id='gym-container-right'>
              <div class='title'>
                ${titleText} ${exDisplay}
              </div>
              <div class='info-container'>
                ${strenghtDisplay}
                <div>
                  ${i18n('Free slots')}: <strong>${gym.slots_available}</strong>
                </div>
                ${gymLeaderDisplay}
                <div>
                  ${i18n('Last scanned')}: <strong>${timestampToDateTime(gym.last_scanned)}</strong>
                </div>
                <div>
                  ${i18n('Last modified')}: <strong>${timestampToDateTime(gym.last_modified)}</strong>
                </div>
              </div>
              <div>
                <a href='javascript:void(0);' onclick='javascript:openMapDirections(${gym.latitude},${gym.longitude},"${settings.mapServiceProvider}");' title='${i18n('Open in')} ${mapServiceProviderNames[settings.mapServiceProvider]}'><i class="fas fa-map-marked-alt"></i> ${gym.latitude.toFixed(5)}, ${gym.longitude.toFixed(5)}</a>
              </div>
            </div>
          </div>
          ${raidDisplay}
          ${pokemonDisplay}
        </div>`
}

function loadGymMemberForMarker(gymid, hasloading) { // eslint-disable-line no-unused-vars
    const labelid = gymid.replace('.', '')
    if (!hasloading) {
        var defenderhtml = `<div class="preloader-wrapper big active" id="gym-marker-loading-spinner${labelid}">
        <div class="spinner-layer">
          <div class="circle-clipper left">
            <div class="circle"></div>
          </div>
          <div class="gap-patch">
              <div class="circle"></div>
          </div>
          <div class="circle-clipper right">
            <div class="circle"></div>
          </div>
        </div>
      </div>`
        $('#marker-gymmember-data-container' + labelid).html(defenderhtml)
    }

    var data = $.ajax({
        url: 'get-gym',
        type: 'GET',
        data: {
            id: gymid
        },
        dataType: 'json',
        cache: false
    })
    data.done(function (result) {
        defenderhtml = ''
        var trainerhtml = ''
        if (result.length) {
            result.forEach((pokemon) => {
                if (serverSettings.gymsTrainer) {
                    trainerhtml = `<div>${i18n('Trainer')}: <strong>${pokemon.trainer}</strong></div>`
                }
                defenderhtml += `
                <div id="member-container">
                  <div id='member-container-left'>
                    <div>
                        <img src='${getPokemonRawIconUrl(pokemon, serverSettings.generateImages)}' width='32'>
                    </div>
                  </div>
                  <div id='member-container-right'>                   
                    <div class='info-container'>
                      <div>
                        ${i18n('CP')}: <strong>${pokemon.cp_now}</strong>
                      </div>
                      ${trainerhtml}
                      <div>
                        ${i18n('Deployed')}: <strong>${timestampToDateTime(pokemon.deployed)}</strong>
                      </div>
                    </div>
                  </div>
                </div>`
            })
        }
        if (result.length === 0) {
            $('#marker-gymmember-data-container' + labelid).html(i18n('No data'))
        } else {
            $('#marker-gymmember-data-container' + labelid).html(defenderhtml)
        }
        $(`#gym-marker-loading-spinner${labelid}`).hide()
        mapData.gyms[gymid].marker.getPopup().setContent($(`gymlabel${labelid}`).html())
    })
    data.fail(function (result) {
        $('#marker-gymmember-data-container' + labelid).html(i18n('Error'))
        $(`#gym-marker-loading-spinner${labelid}`).hide()
        mapData.gyms[gymid].marker.getPopup().setContent($(`gymlabel${labelid}`).html())
    })
}

function toggleGymMarkerPokemonData(hide, gymid) { // eslint-disable-line no-unused-vars
    const labelid = gymid.replace('.', '')
    if (hide) {
        settings.showGymPokemon = false
        $('#marker-gymmember-data-container' + labelid).hide()
        $('#marker-gymmember-data-toggle' + labelid).html(`${i18n('Show Pokémon')} <i class="fas fa-chevron-down"></i>`)
        $('#marker-gymmember-data-toggle' + labelid).attr('onclick', `toggleGymMarkerPokemonData(false,'${gymid}')`)
    } else {
        settings.showGymPokemon = true
        $('#marker-gymmember-data-container' + labelid).show()
        $('#marker-gymmember-data-toggle' + labelid).html(`${i18n('Hide Pokémon')} <i class="fas fa-chevron-up"></i>`)
        $('#marker-gymmember-data-toggle' + labelid).attr('onclick', `toggleGymMarkerPokemonData(true,'${gymid}')`)
        loadGymMemberForMarker(gymid, false)
    }
}

function updateGymLabel(gym, marker) {
    marker.getPopup().setContent(gymLabel(gym))
    if (marker.isPopupOpen() && isValidRaid(gym.raid)) {
        // Update countdown time to prevent a countdown time of 0.
        updateLabelDiffTime()
    }
}

function processGym(gym = null) {
    if (!settings.showGyms && !settings.showRaids) {
        return false
    }

    const id = gym.gym_id
    if (!(id in mapData.gyms)) {
        if (!isGymMeetsFilters(gym)) {
            return true
        }

        const { isEggNotifGym, isRaidPokemonNotifGym, isNewNotifGym } = getGymNotificationInfo(gym)
        if (isNewNotifGym) {
            sendGymNotification(gym, isEggNotifGym, isRaidPokemonNotifGym)
        }

        gym.marker = setupGymMarker(gym, isEggNotifGym || isRaidPokemonNotifGym)
        if (isGymRangesActive()) {
            gym.rangeCircle = setupRangeCircle(gym, 'gym', !isEggNotifGym && !isRaidPokemonNotifGym)
        }
        gym.updated = true
        mapData.gyms[id] = gym

        if (isValidRaid(gym.raid)) {
            raidIds.add(id)
            if (isUpcomingRaid(gym.raid) && gym.raid.pokemon_id !== null) {
                upcomingRaidIds.add(id)
            }
        }
    } else {
        updateGym(id, gym)
    }

    return true
}

function updateGym(id, gym = null) {
    if (id == null || !(id in mapData.gyms)) {
        return true
    }

    const isGymNull = gym === null
    if (isGymNull) {
        gym = mapData.gyms[id]
    }

    if (!isGymMeetsFilters(gym)) {
        removeGym(gym)
        return true
    }

    if (!isGymNull) {
        const oldGym = mapData.gyms[id]
        var hasNewRaid = false
        var hasNewUpComingRaid = false
        var hasNewOngoingRaid = false
        if (isValidRaid(gym.raid)) {
            const isNewRaidPokemon = gym.raid.pokemon_id !== null && (oldGym.raid === null || oldGym.raid.pokemon_id === null)
            hasNewRaid = oldGym.raid === null
            hasNewUpComingRaid = isUpcomingRaid(gym.raid) && isNewRaidPokemon
            hasNewOngoingRaid = isOngoingRaid(gym.raid) && isNewRaidPokemon
        }

        if (gym.last_modified > oldGym.last_modified || hasNewRaid || hasNewOngoingRaid || gym.is_in_battle !== oldGym.is_in_battle) {
            // Visual change, send notification if necessary and update marker.
            const { isEggNotifGym, isRaidPokemonNotifGym, isNewNotifGym } = getGymNotificationInfo(gym)
            if (isNewNotifGym) {
                sendGymNotification(gym, isEggNotifGym, isRaidPokemonNotifGym)
            }
            gym.marker = updateGymMarker(gym, oldGym.marker, isEggNotifGym || isRaidPokemonNotifGym)
            if (oldGym.rangeCircle) {
                gym.rangeCircle = updateRangeCircle(mapData.gyms[id], 'gym', !isEggNotifGym && !isRaidPokemonNotifGym)
            }
        } else {
            gym.marker = oldGym.marker
            if (oldGym.rangeCircle) {
                gym.rangeCircle = oldGym.rangeCircle
            }
        }

        if (settings.useGymSidebar && gymSidebar.isOpen && openGymSidebarId === id) {
            updateGymSidebar(id)
        } else if (gym.marker.isPopupOpen()) {
            updateGymLabel(gym, gym.marker)
        } else {
            // Make sure label/sidebar is updated next time it's opened.
            gym.updated = true
        }

        mapData.gyms[id] = gym

        if (hasNewRaid) {
            raidIds.add(id)
        }
        if (hasNewUpComingRaid) {
            upcomingRaidIds.add(id)
        }
    } else {
        const { isEggNotifGym, isRaidPokemonNotifGym, isNewNotifGym } = getGymNotificationInfo(gym)
        if (isNewNotifGym) {
            sendGymNotification(gym, isEggNotifGym, isRaidPokemonNotifGym)
        }

        updateGymMarker(gym, mapData.gyms[id].marker, isEggNotifGym || isRaidPokemonNotifGym)
        if (settings.useGymSidebar && gymSidebar.isOpen && openGymSidebarId === id) {
            updateGymSidebar(id)
        } else if (gym.marker.isPopupOpen()) {
            updateGymLabel(gym, mapData.gyms[id].marker)
        } else {
            // Make sure label is updated next time it's opened.
            mapData.gyms[id].updated = true
        }
        if (isGymRangesActive() && !gym.rangeCircle) {
            mapData.gyms[id].rangeCircle = setupRangeCircle(gym, 'gym', !isEggNotifGym && !isRaidPokemonNotifGym)
        } else {
            updateRangeCircle(mapData.gyms[id], 'gym', !isEggNotifGym && !isRaidPokemonNotifGym)
        }
    }

    return true
}

function updateGyms() {
    $.each(mapData.gyms, function (id, gym) {
        updateGym(id)
    })
}

function removeGym(gym) {
    const id = gym.gym_id
    if (id in mapData.gyms) {
        if (mapData.gyms[id].rangeCircle) {
            removeRangeCircle(mapData.gyms[id].rangeCircle)
        }
        removeMarker(mapData.gyms[id].marker)
        delete mapData.gyms[id]

        if (raidIds.has(id)) {
            raidIds.delete(id)
        }
        if (upcomingRaidIds.has(id)) {
            upcomingRaidIds.delete(id)
        }
    }
}

function removeRaidMarker(id) { // eslint-disable-line no-unused-vars
    removeMarker(mapData.gyms[id].marker)
}

function readdGymMarkers() {
    $.each(mapData.gyms, function (id, gym) {
        removeMarker(gym.marker)
        gym.marker = setupGymMarker(gym)
    })
}

function excludeRaidLevel(level) { // eslint-disable-line no-unused-vars
    const levels = settings.includedRaidLevels
    const index = levels.indexOf(level)
    if (index > -1) {
        levels.splice(index, 1)
        $('#raid-level-select').val(levels).trigger('change')
        // Reintialize select.
        $('#raid-level-select').formSelect()
    }
}

function excludeRaidPokemon(id) { // eslint-disable-line no-unused-vars
    if (filterManagers.excludedRaidPokemon !== null) {
        filterManagers.excludedRaidPokemon.add([id])
    }
}

function toggleEggNotif(level) { // eslint-disable-line no-unused-vars
    const notifEggs = settings.notifEggs
    if (!notifEggs.includes(level)) {
        notifEggs.push(level)
    } else {
        const index = notifEggs.indexOf(level)
        notifEggs.splice(index, 1)
    }
    $('#egg-notifs-select').val(notifEggs).trigger('change')
    // Reintialize select.
    $('#egg-notifs-select').formSelect()
}

function toggleRaidPokemonNotif(id) { // eslint-disable-line no-unused-vars
    if (filterManagers.notifRaidPokemon !== null) {
        filterManagers.notifRaidPokemon.toggle(id)
    }
}

function getGymNotificationInfo(gym) {
    var isEggNotifGym = false
    var isRaidPokemonNotifGym = false
    var isNewNotifGym = false
    if (settings.raidNotifs && isGymMeetsRaidFilters(gym)) {
        const id = gym.gym_id
        if (isUpcomingRaid(gym.raid) && settings.notifEggs.includes(gym.raid.level)) {
            isEggNotifGym = true
            isNewNotifGym = !(id in notifiedGymData) || !notifiedGymData[id].hasSentEggNotification || gym.raid.end > notifiedGymData[id].raidEnd
        } else if (isOngoingRaid(gym.raid) && settings.raidPokemonNotifs && settings.notifRaidPokemon.has(gym.raid.pokemon_id)) {
            isRaidPokemonNotifGym = true
            isNewNotifGym = !(id in notifiedGymData) || !notifiedGymData[id].hasSentRaidPokemonNotification || gym.raid.end > notifiedGymData[id].raidEnd
        }
    }

    return {
        isEggNotifGym: isEggNotifGym,
        isRaidPokemonNotifGym: isRaidPokemonNotifGym,
        isNewNotifGym: isNewNotifGym
    }
}

function sendGymNotification(gym, isEggNotifGym, isRaidPokemonNotifGym) {
    const raid = gym.raid
    if (!isValidRaid(raid) || (!isEggNotifGym && !isRaidPokemonNotifGym)) {
        return
    }

    if (settings.playSound) {
        ding.play()
    }

    if (settings.showBrowserPopups) {
        const gymName = gym.name !== null && gym.name !== '' ? gym.name : i18n('unknown')
        var notifTitle = ''
        var notifText = ''
        var iconUrl = ''
        if (isEggNotifGym) {
            const expireTime = timestampToTime(raid.start)
            const timeUntil = getTimeUntil(raid.start)
            let expireTimeCountdown = timeUntil.hour > 0 ? timeUntil.hour + 'h' : ''
            expireTimeCountdown += `${lpad(timeUntil.min, 2, 0)}m${lpad(timeUntil.sec, 2, 0)}s`

            notifTitle = `${i18n('Raid')}: ${i18n('Level')} ${raid.level}`
            notifText = `${i18n('Gym')}: ${gymName}\n${i18n('Starts at')} ${expireTime} (${expireTimeCountdown})`
            iconUrl = 'static/images/gym/' + raidEggImages[raid.level]
        } else {
            const expireTime = timestampToTime(raid.end)
            const timeUntil = getTimeUntil(raid.end)
            let expireTimeCountdown = timeUntil.hour > 0 ? timeUntil.hour + 'h' : ''
            expireTimeCountdown += `${lpad(timeUntil.min, 2, 0)}m${lpad(timeUntil.sec, 2, 0)}s`

            var fastMoveName = getMoveName(raid.move_1)
            var chargeMoveName = getMoveName(raid.move_2)

            notifTitle = `${i18n('Raid')}: ${getPokemonNameWithForm(raid.pokemon_id, raid.form, raid.evolution)} (L${raid.level})`
            notifText = `${i18n('Gym')}: ${gymName}\n${i18n('Ends at')} ${expireTime} (${expireTimeCountdown})\n${i18n('Moves')}: ${fastMoveName} / ${chargeMoveName}`
            iconUrl = getPokemonRawIconUrl(raid, serverSettings.generateImages)
        }

        sendNotification(notifTitle, notifText, iconUrl, gym.latitude, gym.longitude)
    }

    var notificationData = {}
    notificationData.raidEnd = gym.raid.end
    if (isEggNotifGym) {
        notificationData.hasSentEggNotification = true
    } else if (isRaidPokemonNotifGym) {
        notificationData.hasSentRaidPokemonNotification = true
    }
    notifiedGymData[gym.gym_id] = notificationData
}
