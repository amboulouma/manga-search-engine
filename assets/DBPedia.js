

/*
Manga Object's data scheme :
{
    titleEnglish: "str",    
    titleRomaji: "str",
    titleKanji: "str",
    imageURL: "url",                            (unsupported)
    description : "str",
    authors: ["str", "str", ...],
    demographics: ["str", "str", ...],
    genres: ["str", "str", ...],
    publishers: ["str", "str", ...],
    magazines : ["str", "str", ...],
    directors : ["str", "str", ...],            (new)
    producers : ["str", "str", ...],            (new)
    studios : ["str", "str", ...],              (new)
    firstPublicationDate: moment,
    lastPublicationDate: moment,
    numberOfVolumes: 45,
    numberOfChapters: 405,                      (unsupported)
    source: "DBPedia"
}

*/    



var DBPedia = {
    //! the maximum number of mangas we can find by a search
    MAX_RESULTS_LENGTH : 9
,
    //! check if a string is a valid URL
    isValidURL : function(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;  
        }
    }
,
    //! get the last fragment of an URI
    getURILastFragment : function(uri){
        if (DBPedia.isValidURL(uri)){
            var parts = uri.split('/');
            return parts[parts.length-1];
        } else {
            return uri;
        }
    }
,
    //! sanitize the string to remove some special characters like ō
    sanitizeName : function(string){
        return string.toLowerCase()
                     .replace(new RegExp('ā', 'g'), 'a')
                     .replace(new RegExp('ē', 'g'), 'e')
                     .replace(new RegExp('ī', 'g'), 'i')
                     .replace(new RegExp('ō', 'g'), 'o')
                     .replace(new RegExp('ū', 'g'), 'u');
    }
,
    //! sanitize the sparql variable
    sanitizeSPARQLName : function(string){
        return "replace(replace(replace(replace(replace(lcase("+string+"),'ā','a'),'ē','e'),'ī','i'),'ō','o'),'ū','u')";
    }
,
    //! get a json object which contains the result of a SPARQL query
    getSPARQLQueryResult : function(query, 
                                      source="https://dbpedia.org/sparql"){
        return new Promise(
            (resolve, reject) => {
                $.get(source, {"query": query, "format":"json"},  function(data) {
                    let result = Array();
                    for(var i=0; i < data["results"]["bindings"].length; ++i){
                        var elem = Object();                
                        Object.keys(data["results"]["bindings"][i]).forEach(function(key) {
                            elem[key] = data["results"]["bindings"][i][key]["value"];
                        });
                        result.push(elem);
                    }
                    resolve(result);
                }).fail(error => {console.log(error);});
            }
        );
    }
,

    //! get a Manga caracteristic which can have multiple values, like (caracteristcType) : authors, magazines, publishers, genres, demographics 
    //! returns a json array, each element of the array contains a label and an URI of one of the results
    //! example : { ["author_URI" : "the URI of the 1st author", "author_label": "name of the 1st author"],
    //              ["author_URI" : "the URI of the 2nd author", "author_label": "name of the 2nd author"] }
    getMangaCaracteristic(mangaURI, caracteristicType){
        return new Promise(
            (resolve, reject) => {
                // check if we manage the caracteristic
                if(!["author", "magazine", "publisher", "director", "producer", "studio", "demographic", "genre"].includes(caracteristicType)){
                    result = [];
                    resolve(result);
                } 

                var caracteristicURI = "?" + caracteristicType + "_URI";
                var caracteristicLabel = "?" + caracteristicType + "_label";
                var caracteristicPredicate = "";
                
                // choose the scheme of the search according to the chosen caracteristic
                if(["author", "magazine", "publisher"].includes(caracteristicType)) {
                    caracteristicPredicate = "dbo:" + caracteristicType;
                } else {
                    caracteristicPredicate = "dbp:" + caracteristicType;
                }
                
                //! select all the URIs of the chosen caracteristic & Manga, and if the URI has a label, add it to the result
                var query = "select distinct * where { "  + mangaURI +  " " + caracteristicPredicate + " " + caracteristicURI + ". "
                                            + " OPTIONAL{" + caracteristicURI + " rdfs:label " + caracteristicLabel + ". "
                                                        + "FILTER(!bound(" + caracteristicLabel + ") || lang(" + caracteristicLabel + ")='en')} "
                                            + " } ";
                
                //! execute the SPARQL query
                DBPedia.getSPARQLQueryResult(query).then(
                    result => {
                        for(var i=0; i<result.length; ++i){
                            //! if the URI has no label, we try to extract one
                            if(result[i][caracteristicType + "_label"] == undefined){
                                result[i][caracteristicType + "_label"] = DBPedia.getURILastFragment( result[i][caracteristicType + "_URI"] ).replace(new RegExp('_','g'),' ');
                            }
                        }
                        resolve(result);
                    }
                );
            }
        );
    }
,
    //! return a json object
    searchByURI: function(mangaURI){
        return new Promise(
            (resolve, reject) => {
                var query = "select * where { OPTIONAL{ " + mangaURI + " rdfs:label ?titleEnglish. "
                                                              + " FILTER( lang(?titleEnglish) = 'en' )} "
                                          + " OPTIONAL{ " + mangaURI + " dbp:jaRomaji ?titleRomaji. } " 
                                          + " OPTIONAL{ " + mangaURI + " dbp:jaKanji ?titleKanji. } "
                                          + " OPTIONAL{ " + mangaURI + " dbo:abstract ?description. "
                                                              + " FILTER( lang(?description)  = 'en') } " 
                                          + " OPTIONAL{ " + mangaURI + " dbo:numberOfVolumes ?numberOfVolumes. } " 
                                          + " OPTIONAL{ " + mangaURI + " dbo:firstPublicationDate ?firstPublicationDate. } "
                                          + " OPTIONAL{ " + mangaURI + " dbp:last ?lastPublicationDate. } "
                                                                        + " } LIMIT 1";
                DBPedia.getSPARQLQueryResult(query).then(
                    results => {
                        //! if no result
                        /*if (results.length <= 0){
                            reject(results);
                            return;
                        }*/

                        var manga = results[0];
                        var promises = [];

                        var caracteristics = ["author", "magazine", "publisher", "director", "producer", "studio", "demographic", "genre"];
                        caracteristics.forEach(function(car){
                            promises.push(DBPedia.getMangaCaracteristic(mangaURI, car).then(
                                subResult => {
                                    var values = [];
                                    for(var i=0; i<subResult.length; ++i){
                                        values.push(subResult[i][car + "_label"]);
                                    }
                                    if(values.length != 0 )
                                        manga[car+"s"] = values;
                                }
                            ));
                        });
                        
                        if ("titleEnglish" in manga && manga["titleEnglish"].endsWith(" (manga)"))
                            manga["titleEnglish"] = manga["titleEnglish"].slice(0,-" (manga)".length);
                        if("firstPublicationDate" in manga)
                            manga["firstPublicationDate"] = moment(manga["firstPublicationDate"]);
                        if("lastPublicationDate" in manga)
                            manga["lastPublicationDate"] = moment(manga["lastPublicationDate"]);
                        manga["source"] = "DBPedia";
                        manga["sourceURL"] = mangaURI.slice(1,-1);
                        $.when.apply($, promises).then(function() {    
                            if ("genres" in manga)
                            {
                                for (var i in manga["genres"])
                                    if (manga["genres"][i].endsWith(" (genre)"))
                                        manga["genres"][i] = manga["genres"][i].slice(0,-" (genre)".length);
                            }
                            resolve(manga);
                        });
                    }
                );
            }
        );
    }
,
    //! return a json array
    searchByName: function(mangaName){
        return new Promise(
            (resolve, reject) => {
                var sanitizedName = DBPedia.sanitizeName(mangaName);
                var query = "select distinct ?manga where { "
                                                      + " ?manga rdf:type dbo:Manga; "
                                                             + " rdfs:label ?manga_label. "
                                                                + " FILTER(lang(?manga_label) = 'en'). "
                                                                + " BIND ( IF ( contains(lcase(str(?manga_label)),' (manga)'), strbefore(str(?manga_label), ' (manga)'), str(?manga_label)) as ?manga_name). "
                                                                + " FILTER (regex("+DBPedia.sanitizeSPARQLName("str(?manga_name)")+",'" + sanitizedName + "')). "
                                                     + " } LIMIT " + DBPedia.MAX_RESULTS_LENGTH ;
                
                DBPedia.getSPARQLQueryResult(query).then(
                    URIs => {
                        let promises = Array();
                        for(var i=0; i<URIs.length; ++i){
                            var mangaURI = "<" + URIs[i]["manga"] + ">";
                            promises.push( DBPedia.searchByURI( mangaURI ) );
                        }
                        $.when.apply($, promises).then(function() {
                            resolve(arguments);
                        });
                    }
                );
            }
        );
    }
,
    //! return a json array
    searchByAuthor: function(author){
        return new Promise(
            (resolve, reject) => {
                var sanitizedAuthor = DBPedia.sanitizeName(author);
                var query = "select distinct ?manga where {  ?author_uri rdfs:label ?author_label. "
                                                    + " ?manga dbo:author ?author_uri ."
                                                    + " ?manga rdf:type dbo:Manga. "
                                                    + " FILTER( regex("+DBPedia.sanitizeSPARQLName("str(?author_label)")+", '" + sanitizedAuthor + "' ) ). "
                                                    + " } LIMIT " + DBPedia.MAX_RESULTS_LENGTH ;
                
                DBPedia.getSPARQLQueryResult(query).then(
                    URIs => {
                        let promises = Array();
                        for(var i=0; i<URIs.length; ++i){
                            var mangaURI = "<" + URIs[i]["manga"] + ">";
                            promises.push( DBPedia.searchByURI( mangaURI ) );
                        }
                        $.when.apply($, promises).then(function() {
                            resolve(arguments);
                        });
                    }
                );
            }
        );
    }
,

    //! return a json array
    searchByGenre: function(genre){
        return new Promise(
            (resolve, reject) => {
                var sanitizedGenre = DBPedia.sanitizeName(genre);
                var query = "select distinct ?manga where { "
                                    + " { "
                                            + " ?manga dbp:genre ?genre. "
                                            + " ?manga rdf:type dbo:Manga. "
                                            + " ?genre rdfs:label ?genre_label. "
                                            + " FILTER( regex("+DBPedia.sanitizeSPARQLName("str(?genre_label)")+", '" +sanitizedGenre + "') ). "
                                    + " } "
                                    + " UNION "
                                    + " { "
                                            + " ?manga dbp:genre ?genre. "
                                            + " ?manga rdf:type dbo:Manga. "
                                            + " FILTER(isLiteral(?genre) && regex("+DBPedia.sanitizeSPARQLName("str(?genre)")+", '" + sanitizedGenre + "') ). "
                                    + " } "
                                    + " UNION "
                                    + " { "
                                            + " ?manga dbp:demographic ?genre. "
                                            + " ?manga rdf:type dbo:Manga. "
                                            + " FILTER(regex("+DBPedia.sanitizeSPARQLName("str(?genre)")+", '" + sanitizedGenre + "') ). "
                                    + " } "
                                    //+ "FILTER(lang(?label) = 'en' )"
                            + " } LIMIT " + DBPedia.MAX_RESULTS_LENGTH ;

                DBPedia.getSPARQLQueryResult(query).then(
                    URIs => {
                        let promises = Array();
                        for(var i=0; i<URIs.length; ++i){
                            var mangaURI = "<" + URIs[i]["manga"] + ">";
                            promises.push( DBPedia.searchByURI( mangaURI ) );
                        }
                        $.when.apply($, promises).then(function() {
                            resolve(arguments);
                        });
                    }
                );
            }
        );
    }

,
    // get the search type on the selector, and then load all the possiblities in the datalist of the search bar 
    loadAutoCompletion: function(){
        return new Promise(
            (resolve, reject) => {
                var TypeSelector = document.getElementById("search-type");
                query = "";

                switch(TypeSelector.value){
                    case "searchByName":
                        query = `select distinct ?label where { 
                                                         ?manga rdf:type dbo:Manga; 
                                                         rdfs:label ?label0. 
                                                         FILTER(lang(?label0) = 'en'). 
                                                         BIND ( IF ( contains(lcase(str(?label0)),"("), strbefore(str(?label0), "("), str(?label0)) as ?label). 
                                                 } `;
                        break;
                    case "searchByAuthor":
                        query = `select distinct ?label where { 
                                                         ?author_uri rdfs:label ?label0. 
                                                         ?manga dbo:author ?author_uri. 
                                                         ?manga rdf:type dbo:Manga. 
                                                         FILTER(lang(?label0) = 'en'). 
                                                         BIND ( IF ( contains(lcase(str(?label0)),"("), strbefore(str(?label0), "("), str(?label0)) as ?label).
                                                 } `;
                        break;
                    case "searchByGenre":
                        query = ` select distinct ?label where {
                                    {
                                       ?manga dbp:genre ?genre.
                                       ?manga rdf:type dbo:Manga.
                                       ?genre rdfs:label ?label0.
                                    }
                                    UNION
                                    {
                                       ?manga dbp:genre ?label0.
                                       ?manga rdf:type dbo:Manga.
                                        FILTER(isLiteral(?label0)).
                                    }
                                    UNION
                                    {
                                        ?manga dbp:demographic ?demo.
                                        ?manga rdf:type dbo:Manga.
                                        ?demo rdfs:label ?label0.
                                    }
                                    FILTER(lang(?label0) = "en" )
                                    BIND ( IF ( contains(lcase(str(?label0)),"("), strbefore(str(?label0), "("), str(?label0)) as ?label).
                                } `;
                        break;
                }

                DBPedia.getSPARQLQueryResult(query).then(
                    labels => {
                        var dataList = document.getElementById("autocomplete");
                        var content = "";

                        for(var i=0; i<labels.length; ++i){
                            content += "<option value='" + labels[i]["label"] + "'>";
                        }

                        dataList.innerHTML = content;
                        console.log("datalist loaded !");
                        resolve(content);
                    }
                );        
            }
        );
    }

};


$( document ).ready(function() {
    DBPedia.loadAutoCompletion().then( result => {  } );
});




