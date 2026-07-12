local plugin_dir = debug.getinfo(1, "S").source:match("^@(.+/)[^/]+$") or "./"
local config = dofile(plugin_dir .. "config.lua")
local ConfirmBox, InfoMessage = require("ui/widget/confirmbox"), require("ui/widget/infomessage")
local MultiConfirmBox, NetworkMgr = require("ui/widget/multiconfirmbox"), require("ui/network/manager")
local Trapper, UIManager = require("ui/trapper"), require("ui/uimanager")
local lfs, logger, util = require("libs/libkoreader-lfs"), require("logger"), require("util")
local _ = require("gettext")
local N_ = require("gettext").ngettext
local T = require("ffi/util").template

local Books = require("ui/widget/container/widgetcontainer"):extend{ name = "books" }

local function save(opds)
    opds.opds_settings:saveSetting("servers", opds.servers)
        :saveSetting("settings", opds.settings)
        :saveSetting("pending_syncs", opds.pending_syncs):flush()
    opds.updated = nil
end

local function removeItem(list, item)
    for i = #list, 1, -1 do
        if list[i] == item then table.remove(list, i) return end
    end
end

local function notice(text) UIManager:show(InfoMessage:new{ text = text, timeout = 3 }) end

function Books:init()
    self:_setupCoverBrowser()
    UIManager:nextTick(function()
        self:_setupOPDS()
        self:_setupSimpleUI()
    end)
end

function Books:_setupCoverBrowser()
    if G_reader_settings:isTrue("books_coverbrowser_seeded") then return end
    local ok, err = pcall(function()
        local BookInfoManager = require("bookinfomanager")
        local filemanager = BookInfoManager:getSetting("filemanager_display_mode")
        local history = BookInfoManager:getSetting("history_display_mode")
        local collections = BookInfoManager:getSetting("collection_display_mode")
        if not filemanager and not history and not collections then
            BookInfoManager:saveSetting("filemanager_display_mode", "mosaic_image")
            BookInfoManager:saveSetting("history_display_mode", "mosaic_image")
            BookInfoManager:saveSetting("collection_display_mode", "mosaic_image")
        elseif filemanager == "list_image_meta" and history == "mosaic_image"
                and collections == "mosaic_image" then
            BookInfoManager:saveSetting("filemanager_display_mode", "mosaic_image")
        end
        BookInfoManager:closeDbConnection()
        G_reader_settings:makeTrue("books_coverbrowser_seeded"):flush()
    end)
    if not ok then logger.warn("Books cover mosaic setup failed:", err) end
end

function Books:_setupOPDS()
    local opds = self.ui.opds
    if not opds then return end
    local managed, obsolete, legacy = {}, {}, nil
    for _, server in ipairs(opds.servers) do
        local kind = server.books_managed
        if (kind == "updates" or kind == "browse") and not managed[kind] then managed[kind] = server end
        if kind == "updates" and server.url and server.url ~= config.updates_url then obsolete[server.url] = true end
        if not kind and not legacy and server.title == "Books" and server.url
                and server.url:match("/catalog/?$") then legacy = server end
    end
    managed.browse = managed.browse or legacy
    for i = #opds.servers, 1, -1 do
        local server, kind = opds.servers[i], opds.servers[i].books_managed
        if server == managed.browse or kind == "updates" or kind == "browse" then table.remove(opds.servers, i) end
    end
    local wanted = {
        { books_managed = "updates", title = "Automatic Book Updates", url = config.updates_url, username = config.username, password = config.password, sync = true },
        { books_managed = "browse", title = "Books Library", url = config.browse_url, username = config.username, password = config.password },
    }
    for _, desired in ipairs(wanted) do
        local kind = desired.books_managed
        local server = managed[kind] or {}
        local old_url = server.url
        for key, value in pairs(desired) do server[key] = value end
        if kind == "browse" then server.sync = nil end
        if kind == "updates" and old_url and old_url ~= desired.url then server.last_download = nil end
        table.insert(opds.servers, server)
    end
    for i = #opds.pending_syncs, 1, -1 do
        local item = opds.pending_syncs[i]
        if obsolete[item.catalog] then table.remove(opds.pending_syncs, i)
        elseif item.catalog == config.updates_url then item.username, item.password = config.username, config.password end
    end
    opds.settings.sync_dir = require("datastorage"):getDataDir():gsub("/+$", "") .. "/books"
    opds.settings.filetypes, opds.settings.sync_max_dl = "epub", 1000
    save(opds)
end

function Books:_setupSimpleUI()
    local ok, QA = pcall(require, "sui_quickactions")
    local ok_config, Config = pcall(require, "sui_config")
    if not ok or not ok_config then return end
    local ok_home, ResumeHome = pcall(dofile, plugin_dir .. "resume_home.lua")
    if ok_home then
        local seeded, seed_err = pcall(ResumeHome.seedIfFresh, config.home_profile)
        if not seeded then logger.warn("Books resume homescreen setup failed:", seed_err) end
        local scaled, scale_err = pcall(ResumeHome.applyAppsPopupScale)
        if not scaled then logger.warn("Books Apps popup scaling failed:", scale_err) end
    end
    if G_reader_settings:isTrue("books_simpleui_seeded_v2") then
        if ok_home then
            local applied, apply_err = pcall(ResumeHome.applyRecentTitles, config.home_profile)
            if not applied then logger.warn("Books recent-title renderer failed:", apply_err) end
        end
        return
    end
    local list, action, group = QA.getCustomQAList()
    for _, id in ipairs(list) do
        local item = QA.getCustomQAConfig(id)
        if item.plugin_key == "books" and item.plugin_method == "updateBooks" then action = id end
        if item.qa_folder and item.label == "Apps" then group = id end
    end
    local function add(label, icon, key, method, folder)
        local id = QA.nextCustomQAId()
        QA.saveCustomQAConfig(id, label, nil, nil, icon, key, method, nil, folder)
        table.insert(list, id)
        QA.saveCustomQAList(list)
        return id
    end
    action = action or add("Sync Books", Config.CUSTOM_PLUGIN_ICON, "books", "updateBooks")
    group = group or add("Apps", Config.CUSTOM_GROUP_ICON, nil, nil, true)
    local members, found = QA.getQAFolderItems(group)
    for _, id in ipairs(members) do if id == action then found = true end end
    if not found then table.insert(members, action); QA.saveQAFolderItems(group, members) end
    local tabs, old = Config.loadTabConfig(), { unpack(Config.DEFAULT_TABS) }
    table.insert(old, group)
    local function matches(wanted)
        if #tabs ~= #wanted then return false end
        for i, id in ipairs(wanted) do if tabs[i] ~= id then return false end end
        return true
    end
    if matches(Config.DEFAULT_TABS) or matches(old) then
        local moved, seen = { "sui_settings", "history", action, "power" }, {}
        for _, id in ipairs(moved) do seen[id] = true end
        for _, id in ipairs(members) do if not seen[id] then table.insert(moved, id) end end
        QA.saveQAFolderItems(group, moved)
        Config.saveTabConfig{ "homescreen", "home", group }
    end
    G_reader_settings:saveSetting("books_simpleui_seeded_v2", true):flush()
    if ok_home then
        local applied, apply_err = pcall(ResumeHome.applyRecentTitles, config.home_profile)
        if not applied then logger.warn("Books recent-title renderer failed:", apply_err) end
    end
    local simpleui = self.ui._simpleui_plugin or self.ui.simpleui
    if simpleui and simpleui._rebuildAllNavbars then simpleui:_rebuildAllNavbars() end
end

function Books:_chooseExisting(item)
    local name = select(2, util.splitFilePathName(item.file))
    name = name:gsub("%.[^.]+$", "")
    local author, title = name:match("^(.-) %- (.+)$")
    local text = author and T(_("Book already exists\n\n“%1” by %2\nis already on this device"), title, author)
        or T(_("Book already exists\n\n“%1” is already on this device"), name)
    local thread = coroutine.running()
    UIManager:show(MultiConfirmBox:new{
        text = text, dismissable = false,
        cancel_text = _("Cancel"), choice1_text = _("Keep"), choice2_text = _("Replace"),
        cancel_callback = function() coroutine.resume(thread, "cancel") end,
        choice1_callback = function() coroutine.resume(thread, "keep") end,
        choice2_callback = function() coroutine.resume(thread, "replace") end,
    })
    return coroutine.yield()
end

function Books:_finish(added, replaced, failed, total, canceled)
    if canceled then
        notice(added + replaced > 0 and T(N_("Update canceled — 1 book updated!", "Update canceled — %1 books updated!", added + replaced), added + replaced) or _("Update canceled!"))
    elseif failed > 0 then
        notice(T(_("%1 of %2 books updated — try again to finish!"), added + replaced, total))
    elseif replaced > 0 and added > 0 then
        notice(T(_("%1 books added, %2 replaced!"), added, replaced))
    elseif replaced > 0 then
        notice(T(N_("1 book replaced!", "%1 books replaced!", replaced), replaced))
    elseif added > 0 then
        notice(T(N_("1 book added!", "%1 books added!", added), added))
    else
        notice(_("Library is up to date!"))
    end
end

function Books:_update()
    local opds = self.ui.opds
    if not opds then notice(_("Books update unavailable!")) return end
    self:_setupOPDS()
    local folder_ok, folder_err = util.makePath(opds.settings.sync_dir)
    if not folder_ok then logger.warn("Books folder unavailable:", folder_err); notice(_("Books folder unavailable!")) return end
    local updates
    for _, server in ipairs(opds.servers) do if server.books_managed == "updates" then updates = server break end end
    local browser = require("opdsbrowser"):new{
        servers = opds.servers, downloads = opds.downloads, settings = opds.settings,
        pending_syncs = opds.pending_syncs, title = _("Books"), _manager = opds,
    }
    browser.sync = true
    local failed, gen, pending_len, old_marker = false, browser.genItemTableFromCatalog,
        #opds.pending_syncs, updates.last_download
    function browser:genItemTableFromCatalog(catalog, url)
        failed = failed or not catalog
        return gen(self, catalog, url)
    end
    local progress = InfoMessage:new{ text = _("Synchronizing library…") }
    UIManager:show(progress); UIManager:forceRePaint()
    browser:fillPendingSyncs(updates)
    UIManager:close(progress)
    if failed then
        while #opds.pending_syncs > pending_len do table.remove(opds.pending_syncs) end
        updates.last_download = old_marker
        save(opds); return
    end
    save(opds)

    local jobs, seen = {}, {}
    for i = #opds.pending_syncs, 1, -1 do
        local item = opds.pending_syncs[i]
        if item.catalog == updates.url then
            if seen[item.file] then notice(_("Library contains conflicting book filenames!")) return end
            seen[item.file] = true
            local attr = lfs.attributes(item.file)
            if attr and attr.size > 0 then
                local choice = self:_chooseExisting(item)
                if choice == "cancel" then save(opds); self:_finish(0, 0, 0, 0, true) return end
                if choice == "keep" then removeItem(opds.pending_syncs, item)
                else table.insert(jobs, { item = item, replacing = true }) end
            else
                if attr then os.remove(item.file) end
                table.insert(jobs, { item = item })
            end
        end
    end
    save(opds)
    if #jobs == 0 then self:_finish(0, 0, 0, 0, false) return end

    local dialog
    dialog = ConfirmBox:new{
        text = T(N_("Downloading 1 book…", "Downloading %1 books…", #jobs), #jobs),
        no_ok_button = true, dismissable = false, cancel_text = _("Cancel"),
        cancel_callback = function() if dialog.dismiss_callback then dialog.dismiss_callback() end end,
    }
    for _, job in ipairs(jobs) do
        os.remove(job.item.file .. ".part"); os.remove(job.item.file .. ".part.done")
    end
    UIManager:show(dialog); UIManager:forceRePaint()
    local completed = Trapper:dismissableRunInSubprocess(function()
        for _, job in ipairs(jobs) do
            local item, part = job.item, job.item.file .. ".part"
            if browser:downloadFile(part, item.url, item.username, item.password) and os.rename(part, item.file) then
                local marker = io.open(part .. ".done", "w")
                if marker then marker:close() end
            else os.remove(part) end
        end
    end, dialog)
    if completed then UIManager:close(dialog) end
    local added, replaced = 0, 0
    for _, job in ipairs(jobs) do
        local part = job.item.file .. ".part"
        if lfs.attributes(part .. ".done") then
            removeItem(opds.pending_syncs, job.item)
            if job.replacing then replaced = replaced + 1 else added = added + 1 end
        end
        os.remove(part); os.remove(part .. ".done")
    end
    save(opds)
    if self.ui.onRefresh then self.ui:onRefresh() end
    self:_finish(added, replaced, #jobs - added - replaced, #jobs, not completed)
end

function Books:updateBooks()
    if self.running then return end
    NetworkMgr:runWhenOnline(function()
        self.running = true
        Trapper:wrap(function()
            local ok, err = xpcall(function() self:_update() end, debug.traceback)
            self.running = nil
            if not ok then logger.warn("Books update failed:", err); notice(_("Library update failed!")) end
        end)
    end)
end

return Books
