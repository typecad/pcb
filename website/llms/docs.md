📗 typeCAD Documentation
    Programmatically create hardware designs with TypeScript and the npm ecosystem.

        {#each tracks as track}

                            {track.title}
                        
                        {track.badge}
                    
                    {track.description}

                        {#each track.links as link}
                            
                                {link.title}
                            
                        {/each}

        {/each}